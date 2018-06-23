const TBA = require("tba-api-storm");
const client = new TBA("DJRE7IGB1IBTCtvpZfFnn7aZfBWoY9bTIZfQFY7CVBZ8tWeNRX6x0XdISQ63skHv");

function currentYear() {
  return new Date().getFullYear();
}

function inRange(x, min, max) {
  return ((x - min) * (x - max) <= 0);
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

function cleanText(string) {
  return string.replace(/<\/?[^>]+(>|$)/g, "");
}

function cap(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function teamStatus(team) {
  let currentEvent = false;
  let currentDate = new Date('2018-03-08');

  return client.getTeamEventList(team, currentYear()).then(function (events) {
    for (let i in events) {
      let startDate = new Date(events[i].start_date);
      let endDate = new Date(events[i].end_date);
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

allInfo(254).then(function (result) {
	console.log(result);
});