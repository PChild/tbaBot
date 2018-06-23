const https = require('https');
const request = require('request-promise');

module['exports'] = function tbaBot(hook) {
  var params = hook.params;
  var commands = params.text.split(" ");

  var options = {
    uri: hook.env.tba_url,
    method: 'POST',
    json: {
      'channel': params.channel_id,
      'text': commands[0],
      'parse': 'full'
    }
  };

  function sendReq() {
    request(options, function (error, response, body) {
      if (error) {
        hook.res.end(error.message);
      }
      hook.res.end();
    });
  }

  let taskToRun;
  
  switch (commands[0]) {
  case "record":
    taskToRun = commands.length >= 2 ? teamRecord(commands[1], commands[2]) : teamRecord(commands[1]);
    break;
  case "awards":
    taskToRun = commands.length >= 2 ? teamAwards(commands[1], commands[2]) : teamAwards(commands[1]);
    break;
  case "status":
    taskToRun = teamStatus(commands[1]);
    break;
  case "events":
    taskToRun = commands.length >= 2 ? seasonEvents(commands[1], commands[2]) : seasonEvents(commands[1]);
    break;
  case "info":
    taskToRun = teamInfo(commands[1]);
    break;
  case "all":
  	taskToRun = allInfo(commands[1]);
    break;
  }
  
  taskToRun.then(function (results) {
        options.json.text = results + "\n\r" + "\n\r" + "\n\r";
        sendReq();
      });


};

function cleanText(string) {
  return string.replace(/<\/?[^>]+(>|$)/g, "");
}

function cap(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function teamStatus(team) {
  let currentEvent = false;
  let currentDate = new Date();

  return client.getTeamEventList(team, currentYear()).then(function (events) {
    for (let i in events) {
      let startDate = new Date(events[i].start_date);
      let endDate = new Date(events[i].end_date + " 11:59 PM");
      let currentPlay = currentDate >= startDate && currentDate <= endDate;

      if (currentPlay) {
        currentEvent = events[i];
      }
    }

    return currentEvent;
  }).then(function (currentEvent) {
    if (currentEvent) {
      return client.getTeamEventStatus(team, currentEvent.key).then(function (status) {
        return status;
      }).then(function (status) {
        let cleanedString = "Team " + team + " is currently at " + currentEvent.name + ". " + cleanText(status.overall_status_str);
        return cleanedString;
      })
    } else {
      return "Team " + team + " is not currently playing.";
    }
  });

}

function teamAwards(team, year = currentYear()) {
  return client.getTeamAwards(team, year).then(function (awards) {
    let awardsString = "Team " + team + " " + year + " awards:\n";
    let resultsString = "";

    for (let i in awards) {
      resultsString += awards[i].name + " @ " + awards[i].event_key + "\n"
    }

    if (resultsString === "") {
      resultsString = "None"
    }

    return awardsString + resultsString;
  })
}

function teamRecord(team, year = currentYear()) {
  return client.getTeamEventListSimple(team, year).then(function (events) {
    let win = 0,
      loss = 0,
      tie = 0,
      oWin = 0,
      oLoss = 0,
      oTie = 0;
    let eventsData = [];

    for (let i in events) {
      let eventData = client.getTeamEventMatchListSimple(team, events[i].key).then(function (matches) {
        for (let j in matches) {
          let teamColor = matches[j].alliances.red.team_keys.indexOf("frc" + team) !== -1 ? "red" : "blue";
          let otherColor = teamColor === "red" ? "blue" : "red";
          let isTie = matches[j].winning_alliance === "";

          inRange(events[i].event_type, 0, 10) ? win += matches[j].winning_alliance === teamColor : oWin += matches[j].winning_alliance === teamColor;
          inRange(events[i].event_type, 0, 10) ? loss += matches[j].winning_alliance === otherColor : oLoss += matches[j].winning_alliance === otherColor;
          inRange(events[i].event_type, 0, 10) ? tie += isTie : oTie += isTie;
        }
        let results = [win, loss, tie, oWin, oLoss, oTie]
        return results;
      })
      eventsData.push(eventData);
    }

    return Promise.all(eventsData).then(function (results) {
      let cleanedString = "In " + year + " Team " + team + " was:\n" + win + "-" + loss + "-" + tie + " in official play";
      let offPlay = oWin + oLoss + oTie;

      if (offPlay > 0) {
        cleanedString += ",\n" + (win + oWin) + "-" + (loss + oLoss) + "-" + (tie + oTie) + " in overall play"
      }
      return cleanedString;
    })
  });
}

function seasonEvents(team, year = currentYear()) {
  let cleanedString = "Team " + team + " " + year + " events:"
  return client.getTeamEventList(team, year).then(function (events) {
    events = events.sort(compareEventDates);

    for (let i in events) {
      let startOptions = {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      };
      let endOptions = {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      };

      let startDate = new Date(events[i].start_date + " 12:00:00");
      let endDate = new Date(events[i].end_date + " 12:00:00");
      cleanedString += "\n" + events[i].short_name + " - " + startDate.toLocaleString("en-US", startOptions) + " to " + endDate.toLocaleString("en-US", endOptions);
    }

    return cleanedString
  });
}

function teamInfo(team) {
  let baseProm = client.getTeam(team);
  let socialProm = client.getTeamSocialMedia(team);

   return Promise.all([baseProm, socialProm]).then(function (fullInfo) {
    let baseInfo = fullInfo[0];
    let socialInfo = fullInfo[1];

    let cleanedString = "Team " + team + " - " + baseInfo.nickname + "\nFrom: " + baseInfo.city + ", " + baseInfo.state_prov + "\nRookie Year: " + baseInfo.rookie_year + "\nWebsite: " + baseInfo.website;

    for (let i in socialInfo) {
      let site = socialInfo[i].type.replace('-profile', '').replace('-channel', '');
      cleanedString += "\n" + cap(site) + ": http://www." + site + ".com/" + socialInfo[i].foreign_key
    }
    
    return cleanedString;
  });
}

function compareEventDates(eventOne, eventTwo) {
  oneDate = new Date(eventOne.start_date);
  twoDate = new Date(eventTwo.start_date);

  if (oneDate < twoDate)
    return -1;
  if (oneDate > twoDate)
    return 1;
  return 0;
}

function currentYear() {
  return new Date().getFullYear();
}

function inRange(x, min, max) {
  return ((x - min) * (x - max) <= 0);
}

function allInfo(team) {
	let info = teamInfo(team);
	let record = teamRecord(team);
	let events = seasonEvents(team);
	let awards = teamAwards(team);
	let status = teamStatus(team);
	
	return Promise.all([info, record, events, awards, status]).then(function (combinedInfo) {
		return combinedInfo[0] + "\n\n" + combinedInfo[1] + "\n\n" + combinedInfo[2] + "\n\n" + combinedInfo[3] + "\n" + combinedInfo[4];
	});
}

class TBA {
  constructor(auth_key) {
    this.header = '?X-TBA-Auth-Key=' + auth_key;
    this.base = 'https://www.thebluealliance.com/api/v3/';
  }

  callAPI(uri) {
    return new Promise((resolve, reject) => {
      let content = '';
      https.get(this.base + uri + this.header, res => {
        if (res.statusCode != 200) {
          reject(res.statusCode + ': ' + res.statusMessage);
        }

        res.on('data', data => {
          content += data;
        });

        res.on('end', data => {
          if (res.statusCode == 200) resolve(JSON.parse(content));
        });
      });
    });
  }

  getStatus() {
    return this.callAPI('status/');
  }

  //Teams

  getTeamList(pageNum, year) {
    return this.callAPI('teams' + (year === undefined ? '' : '/' + year) + '/' + pageNum);
  }

  getTeamListSimple(pageNum, year) {
    return this.callAPI('teams' + (year === undefined ? '' : '/' + year) + '/' + pageNum + '/simple');
  }

  getTeam(teamNum) {
    return this.callAPI('team/frc' + teamNum);
  }

  getTeamSimple(teamNum) {
    return this.callAPI('team/frc' + teamNum + '/simple');
  }

  getYearsParticipated(teamNum) {
    return this.callAPI('team/frc' + teamNum + '/years_participated');
  }

  getTeamDistricts(teamNum) {
    return this.callAPI('team/frc' + teamNum + '/districts');
  }

  getTeamRobots(teamNum) {
    return this.callAPI('team/frc' + teamNum + '/robots');
  }

  getTeamEventList(teamNum, year) {
    return this.callAPI('team/frc' + teamNum + '/events' + (year === undefined ? '' : '/' + year));
  }

  getTeamEventListSimple(teamNum, year) {
    return this.callAPI('team/frc' + teamNum + '/events' + (year === undefined ? '' : '/' + year) + '/simple');
  }

  getTeamEventListKeys(teamNum, year) {
    return this.callAPI('team/frc' + teamNum + '/events' + (year === undefined ? '' : '/' + year) + '/keys');
  }

  getTeamEventMatchList(teamNum, eventKey) {
    return this.callAPI('team/frc' + teamNum + '/event/' + eventKey + '/matches');
  }

  getTeamEventMatchListSimple(teamNum, eventKey) {
    return this.callAPI('team/frc' + teamNum + '/event/' + eventKey + '/matches/simple');
  }

  getTeamEventMatchListKeys(teamNum, eventKey) {
    return this.callAPI('team/frc' + teamNum + '/event/' + eventKey + '/matches/simple');
  }

  getTeamEventAwards(teamNum, eventKey) {
    return this.callAPI('team/frc' + teamNum + '/event/' + eventKey + '/awards');
  }

  getTeamEventStatus(teamNum, eventKey) {
    return this.callAPI('team/frc' + teamNum + '/event/' + eventKey + '/status');
  }

  getTeamAwards(teamNum, year) {
    return this.callAPI('team/frc' + teamNum + '/awards/' + year);
  }

  getTeamMatchList(teamNum, year) {
    return this.callAPI('team/frc' + teamNum + '/matches/' + year);
  }

  getTeamMatchListSimple(teamNum, year) {
    return this.callAPI('team/frc' + teamNum + '/matches/' + year + '/simple');
  }

  getTeamMatchListKeys(teamNum, year) {
    return this.callAPI('team/frc' + teamNum + '/matches/' + year + '/keys');
  }

  getTeamMedia(teamNum, year) {
    return this.callAPI('team/frc' + teamNum + '/media/' + year);
  }

  getTeamSocialMedia(teamNum) {
    return this.callAPI('team/frc' + teamNum + '/social_media');
  }

  //Events - work on this

  getEventList(year) {
    return this.callAPI('events/' + year);
  }

  getEventListSimple(year) {
    return this.callAPI('events/' + year + '/simple');
  }

  getEventListKeys(year) {
    return this.callAPI('events/' + year + '/keys');
  }

  getEvent(eventKey) {
    return this.callAPI('event/' + eventKey);
  }

  getEventSimple(eventKey) {
    return this.callAPI('event/' + eventKey + '/simple');
  }

  getEventAlliances(eventKey) {
    return this.callAPI('event/' + eventKey + '/alliances');
  }

  getEventInsights(eventKey) {
    return this.callAPI('event/' + eventKey + '/insights');
  }

  getEventOprs(eventKey) {
    return this.callAPI('event/' + eventKey + '/oprs');
  }

  getEventPredictions(eventKey) {
    return this.callAPI('event/' + eventKey + '/predictions');
  }

  getEventTeams(eventKey) {
    return this.callAPI('event/' + eventKey + '/teams');
  }

  getEventTeamsSimple(eventKey) {
    return this.callAPI('event/' + eventKey + '/teams/simple');
  }

  getEventTeamsKeys(eventKey) {
    return this.callAPI('event/' + eventKey + '/teams/keys');
  }

  getEventMatches(eventKey) {
    return this.callAPI('event/' + eventKey + '/matches');
  }

  getEventMatchesSimple(eventKey) {
    return this.callAPI('event/' + eventKey + '/matches/simple');
  }

  getEventMatchesKeys(eventKey) {
    return this.callAPI('event/' + eventKey + '/matches/keys');
  }

  getEventRankings(eventKey) {
    return this.callAPI('event/' + eventKey + '/rankings');
  }

  getEventAwards(eventKey) {
    return this.callAPI('event/' + eventKey + '/awards');
  }

  getEventDistrictPoints(eventKey) {
    return this.callAPI('event/' + eventKey + '/district_points');
  }

  //Matches

  getMatch(matchKey) {
    return this.callAPI('match/' + matchKey);
  }

  getMatchSimple(matchKey) {
    return this.callAPI('match/' + matchKey + '/simple');
  }

  //Districts

  getDistrictList(year) {
    return this.callAPI('districts/' + year);
  }

  getDistrictEvents(districtShort) {
    return this.callAPI('district/' + districtShort + '/events');
  }

  getDistrictEventsSimple(districtShort) {
    return this.callAPI('district/' + districtShort + '/events/simple');
  }

  getDistrictEventsKeys(districtShort) {
    return this.callAPI('district/' + districtShort + '/events/keys');
  }

  getDistrictRankings(districtShort, year) {
    return this.callAPI('district/' + districtShort + '/' + year + '/rankings');
  }

  getDistrictTeams(districtShort, year) {
    return this.callAPI('district/' + districtShort + '/teams');
  }

  getDistrictTeamsSimple(districtShort, year) {
    return this.callAPI('district/' + districtShort + '/teams/simple');
  }

  getDistrictTeamsKeys(districtShort, year) {
    return this.callAPI('district/' + districtShort + '/teams/keys');
  }
}

const client = new TBA("DJRE7IGB1IBTCtvpZfFnn7aZfBWoY9bTIZfQFY7CVBZ8tWeNRX6x0XdISQ63skHv");