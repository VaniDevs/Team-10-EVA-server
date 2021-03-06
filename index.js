var express = require('express');
var bodyParser = require('body-parser');
var ParseServer = require('parse-server').ParseServer;
var http = require('http');

var SUCCESS = 200;
var BADREQUEST = 400;
var NOTFOUND = 404;
var UNKNOWN_CLIENT_ERROR = 500;

// Basic Functions
function isEmpty(arr) {
  return JSON.stringify(arr) === JSON.stringify({}) ? true : false;
}

// Parse App
var databaseUri = process.env.DATABASE_URI || process.env.MONGOLAB_URI;
if (!databaseUri) {
  console.log('DATABASE_URI not specified, falling back to localhost.');
}

var appId = 'VanHacks';
var masterKey = 'spiderman';
var api = new ParseServer({
  databaseURI: databaseUri || 'mongodb://localhost:27017/dev',
  cloud: process.env.CLOUD_CODE_MAIN || __dirname + '/cloud/main.js',
  appId: process.env.APP_ID || appId ||'myAppId',
  masterKey: process.env.MASTER_KEY || masterKey || '', //Add your master key here. Keep it secret!
  serverURL: process.env.SERVER_URL || 'http://localhost:1337/parse'  // Don't forget to change to https if needed
});
// Client-keys like the javascript key or the .NET key are not necessary with parse-server
// If you wish you require them, you can set them as options in the initialization above:
// javascriptKey, restAPIKey, dotNetKey, clientKey

var app = express();
app.use(bodyParser.urlencoded({
    extended: true
}));

// Serve the Parse API on the /parse URL prefix
var mountPath = process.env.PARSE_MOUNT || '/parse';
app.use(mountPath, api);

// Parse Server plays nicely with the rest of your web routes
var port = process.env.PORT || 1337;
app.listen(port, function() {
  console.log('VanHacks project running on port ' + port + '.');
});



// External API Endpoints
// Reverse geocoding to get address from coordinates
// var getRequest = http.get(url, function (response) {
//     var buffer = '', data, route;
//
//     response.on("data", function (chunk) {
//         buffer += chunk;
//     });
//
//     response.on("end", function (err) {
//         // finished transferring data
//         // dump the raw data
//         data = JSON.parse(buffer);
//     });
// });

// VanHacks project
// Endpoints
app.get('/', function(req, res) {
  console.log(SUCCESS, 'Calling VanHacks service');
  res.success();
});

app.get('/info', function(req, res) {
  console.log(req.method + ' ' + req.url + ' Getting Info');
  var description =
  '\nVanHacks Project \n\
  Targeted Non-Profit Organization: Ending Violence Association of BC (by way of PeaceGeeks) works to coordinate \
  and support the work of victim-serving and other anti-violence programs in British Columbia. \n\
  Team: Madeleine Chercover, Tammy Liu, Dennis Trailin, Mathew Teoh, Daniel Tsang \n\
  Challenge: Its challenge to participants is to develop a mobile personal security app, designed to work as a 24/7 monitored alarm system.';
  console.log(SUCCESS, req.method, req.url, description);
  res.send(200);
});


// Database
var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;
var dbUrl = 'mongodb://localhost:27017/dev';

// Twilio
var accountSid = 'AC21adaea8c9b81cba7ab6e41b6c866186';
var authToken = '92ea91beabd04e0cfd3fcbff68c8f0ae';
var twilio = require('twilio')(accountSid, authToken);

var serviceNum = '+16042391416';
var securityNum = '+16479953366';

var dbUserQuery = function(queryParams, callback) {
  MongoClient.connect(dbUrl, function (err, db) {
    if (err) {
      console.log('Unable to connect to the mongoDB server. Error:', err);
    } else {
      console.log('Connection established to', dbUrl);

      var collection = db.collection('_User');
      collection.findOne(queryParams, function(err, user) {
        if(err){
          console.log(500, 'Query error', err);
          res.status(500).send('Query error');
        } else {
          //Close connection
          db.close();
          console.log(200, 'Query successful for', user);
          callback(user);
        }
      });
    }
  });
};

// POST from Twilio
// @initializer text message sent to serviceNumber +16042391416
// @req.body { To, From, SmsMessagesid, Body }
// @return text to security, and back to user
app.post('/message/in', function(req, res) {
  console.log(req.method, req.url,'Twilio: receiving message to ', req.body.To);
  try {
    if(isEmpty(req.body)) throw BADREQUEST;   //empty body
    if(String(req.body.To) != String(serviceNum)) throw BADREQUEST;   //not send to Twilio number

    var message = req.body.Body,
        fromNum = String(req.body.From);
    var email = JSON.parse(message).email;
    console.log(SUCCESS, 'Twilio received message to', serviceNum, 'from', fromNum, ', with SmsSid:', req.body.SmsMessageSid);

    // TODO parse message for home and current location, then send data to security

    try {

      dbUserQuery({ email: email }, function(user) {
        var securityMessage = 'Help needed for ' + user.firstName + ' ' + user.lastName + '!!!';
        twilio.messages.create({
          body: securityMessage,
          to: securityNum,
          from: serviceNum
        }, function(err, message) {
          if(err){
            console.log(UNKNOWN_CLIENT_ERROR, 'Twilio did not send security message to', loadUser);
            res.status(UNKNOWN_CLIENT_ERROR).send('Twilio did not send security message from ' + fromNum);
          } else {
            console.log(SUCCESS, 'Twilio sent security message from', fromNum);

            // Respond to user with bogo message
            var reply = 'Congratulations! You just won an all expenses paid trip to Bucharest, Romania. Please call within 24 hours to claim your prize.';
            twilio.messages.create({
               body: reply,
               to: fromNum,
               from: serviceNum
            }, function(err, message) {
             if(err) {
               console.log(UNKNOWN_CLIENT_ERROR, 'Twilio did not reply to user\n', req.body, err);
               res.status(UNKNOWN_CLIENT_ERROR).send('Twilio did not reply to user');
             } else {
               console.log(SUCCESS, 'Twilio responded to message');
               res.status(SUCCESS).send('Twilio client: responded to message');
             }
            });
          }
        });
      });

    } catch(err) {
      console.log(err, 'VanHacks service failed to retrieve member from database');
      res.status(err).send('VanHacks service failed to retrieve member from database');
    }
  } catch (err) {
  console.log(err, 'Twilio message receive ERROR');
  res.status(err).send('Twilio message receive ERROR');
  }
});

// POST from direct URL
// Called from the Android app when there is data
// @body  { phoneId?, userId }
app.get('/sendHelp', function(req, res) {
  console.log(req.method, req.url, 'VanHacks service: receiving data externally');

  //TODO get data fields from body
  var phoneNum = '';

  dbUserQuery({ phoneNumber: phoneNum }, function(user) {
    //TODO temporarily send text message to security
    var securityMessage = 'A <securityMessage> from an external endpoint';
    twilio.messages.create({
      body: securityMessage,
      to: securityNum,
      from: serviceNum
    }, function(err, message) {
      if(err) {
        console.log(UNKNOWN_CLIENT_ERROR, 'Twilio did not send security message to', user);
        res.status(UNKNOWN_CLIENT_ERROR).send('Twilio did not send security message from xx' + serviceNum);
      } else {
        console.log(SUCCESS, 'Twilio sent security message from', serviceNum);
        res.status(200).send('Twilio sent security message from', serviceNum);
      }
    });
  });

  // MongoClient.connect(dbUrl, function (err, db) {
  //   if (err) {
  //     console.log('Unable to connect to the mongoDB server. Error:', err);
  //   } else {
  //     console.log('Connection established to', dbUrl);
  //
  //     var collection = db.collection('_User');
  //     // TODO Temporarily query by phoneNumber
  //     var query = { phoneNumber: phoneNum };
  //     collection.findOne(query, function(err, item) {
  //       if(err){
  //         console.log(500, 'Query error', err);
  //         res.status(500).send('Query error');
  //       } else {
  //         //Close connection
  //         db.close();
  //         console.log(200, 'Query successful for', JSON.stringify(item));
  //
  //         var loadUser = item;
  //
  //         //TODO temporarily send text message to security
  //         var securityMessage = 'A <securityMessage> from an external endpoint';
  //         twilio.messages.create({
  //           body: securityMessage,
  //           to: securityNum,
  //           from: serviceNum
  //         }, function(err, message) {
  //           if(err) {
  //             console.log(UNKNOWN_CLIENT_ERROR, 'Twilio did not send security message to', loadUser);
  //             res.status(UNKNOWN_CLIENT_ERROR).send('Twilio did not send security message from ' + serviceNum);
  //           } else {
  //             console.log(SUCCESS, 'Twilio sent security message from', serviceNum);
  //           }
  //         });
  //       }
  //     });
  //   }
  // });
});
