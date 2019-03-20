/* SETUP */
var Discord = require('discord.io');
var logger = require('winston');
var AWS = require('aws-sdk');
AWS.config.update({region:'us-east-2'});
var UUID = require('uuid');
var search = require('youtube-search');
var spotify = require('node-spotify-api');
var google = require('google');
google.resultsPerPage = 3;
var dynamo = new AWS.DynamoDB.DocumentClient();

var token = '';
var ytKey = '';
var spotifyClient = {};
try {
    var auth = require('./auth.json');
    token = auth.token;
    ytKey = auth.key;
    spotifyClient = new spotify({
        id: auth.spotifyClient,
        secret: auth.spotifySecret
    });
} catch {
    token = process.env.DIS_SECRET;
    ytKey = process.env.YT_KEY
    spotifyClient = new spotify({
        id: process.env.SPOTIFY_CLIENT,
        secret: process.env.SPOTIFY_SECRET
    });
}
if(!token) {
    throw "NO TOKEN";
}

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});
logger.level = 'debug';
// Initialize Discord Bot
var bot = new Discord.Client({
   token: token
});
bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
});
bot.on('disconnect', function(errMsg, code) {
    logger.info('DISCONNECT[' + code + ']:' + errMsg);
});
/* END SETUP */


// variables
let lastMessages = {};
/* CONFIG */
let codeBall = [];
dynamo.scan({
    TableName: 'CodeBall'
}, function(err, data) {
    if(!err) {
        if(data.Items && data.Items.length > 0) {
            codeBall = data.Items;
        }
    }
});
let ball = [
    'Yes',
    'No',
    'Maybe',
    'Probably',
    'Probably Not'
];
let adminUserID = "188747873876312064";
let points = [0, 1, 2, 3, 5, 8, 13, 21, 34];
let blackJack = {};
let quotes = [];
dynamo.scan({
    TableName: 'Quotes'
}, function(err, data) {
    if(!err) {
        if(data.Items && data.Items.length > 0) {
            quotes = data.Items;
        }
    }
});
let bannedUsers = [];
dynamo.scan({
    TableName: 'Banned'
}, function(err, data) {
    if(!err) {
        if(data.Items && data.Items.length > 0) {
            bannedUsers = data.Items;
        }
    }
});
/* END CONFIG */

//daily reminders 
let dailyReminders = [
];

function setDailyReminder(reminder) {
    let endTime = new Date();
    endTime.setHours(reminder.hours);
    endTime.setMinutes(reminder.minutes);
    endTime.setSeconds(0);
    if(endTime <= new Date()) {
        endTime.setDate(endTime.getDate() + 1);
    }
    endTime -= new Date();
    setTimeout(() => {
        bot.sendMessage({
            to: '385897781681848323', // general 
            message: reminder.message
        });
        setDailyReminder(reminder);
    }, endTime);
}
dailyReminders.forEach(function(reminder) {
    setDailyReminder(reminder);
});

bot.on('message', function (user, userID, channelID, message, evt) {
    if(user === "sp-bot") return;
    /* HELPER VARIABLES */
    let lastMessage = lastMessages[channelID] || '';
    if(message.substring(0,1) !== "!") {
        lastMessages[channelID] = message;
    }
    if(banIndex(userID) !== -1) return;
    let lowerMessage = message.toLowerCase();
    let sendBack = function(messageToSend) {
        bot.sendMessage({
            to: channelID,
            message: messageToSend
        });
    }

    /* COMMANDS */
    if (message.substring(0, 1) == '!') {
        let args = message.substring(1).split(' ');
        let cmd = args[0];
       
        args = args.splice(1);
        args = parseQuotes(args);
        switch(cmd) {
            case 'help':
                sendBack("!info, !google [term], !alexaplay [artist,album,track] [term], !yt [term], !tf2, !getout, !shoot, !blame, !brokeeverything, !timeleft [hour|optional] [min|optional] [day|optional], !jira [id], !ban [user], !unban [user], !banned, !banreason [person], !quotes [person[add|optional]|optional], !hooker, !bjjoin, !bjplayers, !bjstart, !bjend, !hitme, !hold, !sb, !lmgtfy [question|optional], !reminder [person] [time|ex:5m:30s|ex:15:30] [message], !coin, !brokencode [add [reason]|optional], !8ball, !points, !repo");
            break;
            case 'google':
                google(args.join(" "), function(err, results) {
                    if(err) {
                        sendBack(err);
                    } else {
                        let googleResults = '';
                        results.links.forEach(function(googleResult) {
                            if(googleResult.link) {
                                googleResults += bold(googleResult.title) + "\n" + googleResult.description + "\n<" + googleResult.href + ">\n\n";
                            }
                        });
                        sendBack(googleResults);
                    }
                });
            break;
            case 'alexaplay':
                try {
                    spotifyClient.search({type: args[0], query: args.slice(1, args.length).join(" "), limit: 1}, function(err, results) {
                        if(err) {
                            sendBack(err);
                        } else {
                            let spotifyResult = results[Object.keys(results)[0]].items[0];
                            sendBack(spotifyResult.name + ' - ' + (spotifyResult.release_date || '') + "\n" + spotifyResult.external_urls.spotify);
                        }
                    });
                } catch (e) {
                    sendBack(e.message);
                }
            break;
            case 'yt':
                search(args.join(" "), {key: ytKey, maxResults: 1}, function(err, results) {
                    if(err) {
                        sendBack(err);
                    } else {
                        let resultString = '';
                        results.forEach(function(result, index) {
                            let link = (index === 0) ? result.link : '<' + result.link + '>';
                            resultString += result.title + ' - ' + result.channelTitle + "\n" + link + "\n\n"
                        });
                        sendBack(resultString);
                    }
                });
            break;
            case 'blame':
                let personKeys = Object.keys(bot.users);
                sendBack('It was ' + bot.users[personKeys[Math.floor(Math.random() * personKeys.length)]].username + '!');
            break
            case 'timeleft':
                let targetTime = new Date();
                let targetHour = args[0] ? Number(args[0]) : 17;
                if(targetHour < targetTime.getHours()) {
                    targetTime.setDate(targetTime.getDate() + 1);
                }
                targetTime.setHours(targetHour);
                targetTime.setMinutes(args[1] || 0);
                targetTime.setSeconds(args[2] || 0);
                let diffTime = (targetTime - Date.now());
                let hours = Math.floor(diffTime/60/60/1000);
                diffTime -= hours*60*60*1000;
                let minutes = Math.floor(diffTime/60/1000);
                diffTime -= minutes*60*1000;
                let seconds = Math.floor(diffTime/1000);
                diffTime -= seconds * 1000;
                sendBack(hours + ' hours ' + minutes + ' minutes ' + seconds + ' seconds ' + diffTime + ' milliseconds');
            break;
            case 'ban':
                let banId = getId(bot.users, args[0]);
                if(banId) {
                    banUser(sendBack, userID, banId, args.slice(1, args.length).join(" "));
                }
            break;
            case 'unban':
                let unbanId = getId(bot.users, args[0]);
                if(unbanId) {
                    unbanUser(sendBack, userID, unbanId);
                }
            break;
            case 'banreason':
                sendBack(getBanReason(getId(bot.users, args.slice(0, args.length).join(" "))));
            break;
            case 'banned':
                sendBack('Banned users: ' + getBannedList());
            break;
            case 'quotes':
                if(args && args.length > 1 && args[1].toLowerCase() === "add") {
                    let quote = args.slice(2, args.length).join(" ");
                    dynamo.put({
                        TableName: 'Quotes',
                        Item: {
                            "person": args[0],
                            "UUID": UUID(),
                            "quote": quote
                        }
                    }, function(err, data) {
                        if(err) {
                            sendBack('Error adding quote: ' + err);
                        } else {
                            quotes.push({person: args[0], quote: quote})
                            sendBack('Added');
                        }
                    });
                } else { // random
                    sendBack(getRandomQuote(args[0]))
                }
            break;
            case 'lmgtfy':
                let lmgtfyMessage = lastMessage;
                if(args[1]) {
                    lmgtfyMessage = message.substring(8);
                } 
                sendBack('http://lmgtfy.com/?q=' + lmgtfyMessage.replace(/[ ]/g, "%20"));
            break;
            case 'reminder':
                let person = mention(bot.users, args[0]) || 'reminder';
                let calcTime = 0;
                if(args[1].includes(':')) {
                    let hour = Number(args[1].split(':')[0]);
                    let minute = Number(args[1].split(':')[1]);
                    calcTime = new Date();
                    calcTime.setHours(hour);
                    calcTime.setMinutes(minute);
                    calcTime -= new Date();
                } else {
                    calcTime = getTimeInMs(args[1])
                }
                let remindMessage = args.slice(2, args.length).join(" ");
                setTimeout(function() { sendBack(person + ': ' + remindMessage); }, calcTime);
            break;
            case 'coin': 
                let random = Math.round(Math.random());
                sendBack((!random) ? "heads" : "tails");
            break;
            case 'brokencode':
                if(args.length > 1 && args[0].toLowerCase() === 'add') {
                    let codeReason = args.slice(1,args.length).join(" ");
                    dynamo.put({
                        TableName: 'CodeBall',
                        Item: {
                            "reason": codeReason
                        }
                    }, function(err, data) {
                        if(err) {
                            sendBack('Error adding reason: ' + err);
                        } else {
                            codeBall.push({reason: codeReason})
                            sendBack('Added');
                        }
                    });
                } else {
                    sendBack(codeBall[Math.floor(Math.random() * codeBall.length)].quote);
                }
            break;
            case '8ball':
                sendBack(ball[Math.floor(Math.random() * ball.length)])
            break;
            case 'points':
                sendBack(points[Math.floor(Math.random() * points.length)]);
            break;
            case 'sb':
                if(lastMessage) {
                    sendBack(bobify(lastMessage));
                }
            break;
            case 'repo':
                sendBack('https://github.com/djlafo/dylan_bot');
            break;
        }
        return;
     /* EXACT MATCHES */
     } else if(message === 'wat' || message === 'wut' || message === 'what') {
         sendBack(bold(lastMessage.toUpperCase()));
         return;
     } else if (message === 'deez') {
        sendBack('nutz');
     }
});


/* HELPER FUNCTIONS */
function getId(users, username) {
    let found = Object.keys(users).find(function(user) {
        return users[user].username.toLowerCase() === username.toLowerCase();
    });
    if(found) return users[found].id;
}
function getUsername(users, id) {
    let found = Object.keys(users).find(function(user) {
        return users[user].id === id;
    });
    return (!!found) ? users[found].username : 'missing';
}
function mention(users, username) {
    let id = getId(users, username);
    if(id) {
        return '<@' + id + '>';
    }
}
function bold(str) {
    return '**' + str + '**';
}
function getTimeInMs(str) {
    let timeArgs = str.split(':');
    let calcTime = 0;
    timeArgs.forEach(function(timeArg) {
        let number = Number(timeArg.substring(0, timeArg.length -1));
        let unit = timeArg.substring(timeArg.length - 1, timeArg.length - 0).toLowerCase();
        if(unit === 'd') {
            calcTime += number * 24 * 60 * 60 * 1000;
        } else if(unit === 'h') {
            calcTime+= number * 60 * 60 * 1000;
        } else if(unit === 'm') {
            calcTime += number * 60 * 1000;
        } else if(unit === 's') {
            calcTime += number * 1000;
        }
    });
    return calcTime
}
function execInclude(includeStrToFn, lowerMessage) {
    for(let i=0; i<includeStrToFn.length; i+=2) {
        if(lowerMessage.includes(includeStrToFn[i])) {
            includeStrToFn[i+1]();
        }
    }
}
function getWholeArg(args, ind) {
    if(args[ind].startsWith('"')) {
        for(let i=0; i<args.length; i++) {
            if(args[i].endsWith('"')) {
                return { 
                    text: args.slice(ind, i + 1).join(" ").replace(/[\"]/g, ""),
                    end: i
                };
            }
        }
        return 'missing "';
    } else {
        return { 
            text: args[ind],
            end: ind
        };
    }
}
function parseQuotes(args) {
    let newArgs = [ ];
    for(let i=0; i<args.length; i++) {
        if(args[i].startsWith('"')) {
            let parsed = getWholeArg(args, i);
            newArgs.push(parsed.text);
            i = parsed.end;
        } else {
            newArgs.push(args[i]);
        }
    }
    return newArgs;
}
function bobify(txt) {
    var newStr = '';
    var cap = false;
    for(var i=0; i<txt.length; i++) {
        newStr += (cap) ? txt[i].toUpperCase() : txt[i].toLowerCase();
        cap = !cap;
    }
    return newStr;
}
function blackJackDealer(users, sendBack, game) {
    if(!game.started) {
        sendBack('Game is not started');
    } else if(game.currentPlayer >= game.players.length) {
        game.started = false;
        let winners = [];
        game.players.forEach(function(player, playerIndex) {
            if(player.hand > 21) return;

            if (winners.length === 0 || player.hand > game.players[winners[0]].hand) {
                winners = [playerIndex];
            } else if(player.hand === game.players[winners[0]].hand) {
                winners.push(playerIndex);
            }
        });
        let formatted = '';
        if(winners.length !== 0) {
            winners.forEach(function(winner) {
                formatted += getUsername(users, game.players[winner].user) + ', ';
            });
        } else {
            formatted = 'No winners! you are all horrible';
        }
        blackJack.players = [];
        sendBack('Game is over!\nWinners are: ' + formatted);
    } else {
        sendBack('Youre currently at ' + blackJack.players[blackJack.currentPlayer].hand + ' ' + getUsername(users, blackJack.players[blackJack.currentPlayer].user) + ', what would you like to do?');
    }
}
function isTurn(sendBack, game, id) {
    if(game.players[game.currentPlayer].user === id) {
        return true;
    } else {
        sendBack('It isnt your turn dumbass');
        return false;
    }
}
function getPlayers(users, game) {
    let players = "";
    game.players.forEach(function(player) {
        players += getUsername(users, player.user) + ', ';
    });
    return players;
}
function banIndex(id) {
    return bannedUsers.findIndex(function(user) {
        return (id === user.id);
    });
}
function getBannedList() {
    var names ='';
    bannedUsers.forEach(function(user) {
        names += getUsername(bot.users, user.id) + ", ";
    });
    return names;
}
function getBanReason(id) {
    var ban = bannedUsers.find(function(ban) {
        return ban.id === id;
    });
    if(ban) {
        return ban.reason;
    }
}
function banUser(sendBack, userId, id, reason) {
    if(banIndex(id) !== -1 || userId !== adminUserID) return;

    dynamo.put({
        TableName: 'Banned',
        Item: {
            "id": id,
            "reason": reason || "None Given"
        }
    }, function(err, data) {
        if(err) {
            sendBack('Error banning user:' + err);
        } else {
            sendBack('Banned');
            bannedUsers.push({id: id, reason: reason});
        }
    });
}
function unbanUser(sendBack, userId, id) {
    if(banIndex(id) === -1 || userId !== adminUserID) return;

    dynamo.delete({
        TableName: 'Banned',
        Key: {
            "id": id
        }
    }, function(err, data) {
        if(err) {
            sendBack('Error unbanning user: ' + err);
        } else {
            var ind = bannedUsers.findIndex(function(banuse) {
                banuse.id === id;
            });
            bannedUsers.splice(ind, 1);
            sendBack('Unbanned');
        }
    });
}
function getRandomQuote(name) {
    if(name) {
        var indQuotes = quotes.filter(function(quote) {
            return quote.person.toLowerCase() === name.toLowerCase();
        });
    } else {
        indQuotes = quotes;
    }
    if(indQuotes.length > 0) {
        var found = indQuotes[Math.floor(Math.random() * indQuotes.length)];
        return found.person + ": " + found.quote;
    } else {
        return "No quote found";
    }
}

bot.connect();