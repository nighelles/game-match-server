//INCLUDES
var mongoose = require('mongoose');
var bcrypt = require('bcrypt');

// DATABASE
mongoose.connect('mongodb://localhost/test');

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function callback() {
	// connected succesfully to database
});


//MODELS FOR DATABASE

var gameRequestSchema = mongoose.Schema({
	username: String,
    gametype: String,
	loc: { type: [Number], index: '2dsphere'}, //geoJSON type
    dist: Number,
    available: Number,
    players: Number
});

var gameRequest = mongoose.model('gameRequest',gameRequestSchema);

gameRequest.remove({}, function(err) { 
	console.log('Old requests removed.') 
});

// create a test request
var testRequest = new gameRequest({
	username: 'nighelles',
	gametype: 'Server Development',
	loc: [122.264,37.866],
	dist: 1,
	available: 1,
	players: 2
});

//MODEL FOR USERS

var userSchema = mongoose.Schema({
	username: String,
	password: String
});

var matchUser = mongoose.model('matchUser', userSchema);

// Save the new request that we just made
testRequest.save(function (err, testRequest) {
	if (err) return console.error(err);
});

console.log(JSON.stringify(testRequest));


// start what we'll expose to the client

var https = require('https')
var fs = require('fs')

var serverOptions = {
	key: fs.readFileSync('certs/server.key'),
    cert: fs.readFileSync('certs/server.crt')
};

http = https.createServer(serverOptions, handler);

var io = require('socket.io').listen(http)

//http.listen(8024);
http.listen(443);

function handler(req, res) {
	fs.readFile(__dirname + '/index.html',
		function (err, data) {
			if (err) {
				res.writeHead(500);
				return res.end("Error loading index.html");
			}

			//res.writeHead(200);
			//res.end(data);
			res.end("Web Interface coming soon");
		});
	console.log('Responded to http request');
}

io.sockets.on('connection', function(socket) {
	socket.alias = "noname";
	var searchpoint = [0,0];

	socket.room = 'waiting';
	socket.join(socket.room);

	socket.on('disconnect', function() {
		console.log(socket.alias + "DISCONNECTED");

		var allResponse = {'type' : 'PLAYERLEFT', 'alias' : socket.alias};

		socket.broadcast.to(socket.room).emit('notification', allResponse);

		// CLEAN UP REQUESTS THAT MIGHT BE FLOATING AROUND
		gameRequest.findOne({username: socket.alias}, function(err, request) {
			if (request != null) { //Match could have started and been deleted already
				request.available = request.available + 1;

				if (request.available == request.players) {
					console.log("Match Request is empty, deleting");
					request.remove();
				}
			}
		});
	});

	socket.on('setAlias', function (data) {
		var loginAlias = data['alias'];
		var loginPassword = data['password'];

		matchUser.findOne({username:loginAlias}, function(err, loginUser) {
			if (loginUser != null) {
				//check password
				bcrypt.compare(loginPassword,loginUser.password,function(err, res) {
					if (res == false) {
						// BAD PASSWORD
						var badPwdResponse = {'type' : 'BADPASSWORD', 'alias': socket.alias};
						socket.emit('notification', badPwdResponse);
						console.log("User attempted login as: " + loginAlias + " BAD PASSWORD");
					} else {
						// Password is ok, login user
						//searchpoint = data['loc'];

						console.log("User logged in as: " + data['alias']);
						console.log("They are at: " + searchpoint)
						socket.alias = data['alias'];

						var loginResponse = {'type' : 'LOGINOK', 'alias': loginAlias};
						socket.emit('notification', loginResponse);
					}
				});
			} else {
				var badPwdResponse = {'type' : 'BADPASSWORD', 'alias': socket.alias};
				socket.emit('notification', badPwdResponse);
				console.log("User not found: ",loginAlias);
			}
		});
	});

	socket.on('createAlias', function (data) {
		var loginAlias = data['alias'];
		var loginPassword = data['password'];

		matchUser.findOne({username:loginAlias}, function(err, loginUser) {
			if (loginUser != null) {
				//already taken
				var userNameResponse = {'type' : 'USERNAMETAKEN', 'alias': wantedName};
				socket.emit('notification', userNameResponse);
			} else {

				// user does not exist, create it
				bcrypt.genSalt(10, function(err, salt) {
					bcrypt.hash(loginPassword, salt, function (err, hash) {
						var newUser = new matchUser({
							username: loginAlias,
							password: hash
						});
						newUser.save(); // Save new user into data base
						//searchpoint = data['loc'];

						console.log("User registered as: " + data['alias']);
						console.log("They are at: " + searchpoint)
						socket.alias = data['alias'];

						var loginResponse = {'type' : 'REGISTEROK', 'alias': loginAlias};
						socket.emit('notification', loginResponse);
					});
				});
			}
		});
	});

	socket.on('checkUser', function (data) {
		var wantedName = data['alias'];
		matchUser.findOne({username:wantedName}, function(err, user) {
			if (user == null) {
				var userNameResponse = {'type' : 'USERNAMEAVAILABLE', 'alias': wantedName};
				socket.emit('notification', userNameResponse);
			} else {
				var userNameResponse = {'type' : 'USERNAMETAKEN', 'alias': wantedName};
				socket.emit('notification', userNameResponse);
			}
		});
	});

	socket.on('updateLocation', function (loc) {
		searchpoint = loc;
		console.log("User + " + socket.alias + " changed location to:" + loc);

		var allResponse = {
			'type' : 'PLAYERLOCATION', 'alias' : socket.alias, 
			'lng' : searchpoint[0],
			'lat' : searchpoint[1]
		};
		socket.broadcast.to(socket.room).emit('notification', allResponse);
	});

	socket.on('gameRequest', function (request) {
		console.log('new game request');

		searchpoint = request['loc'];

		console.log(request['loc']);
		console.log(searchpoint);
		
		var searchdist = request['dist']/3963;

		gameRequest.find({
			gametype: request['gametype']
		}).where('loc').near({ center: searchpoint, maxDistance: searchdist, spherical: true}).exec(
		function(err, results) {

			console.log(err);
		
			if (results.length == 0) {
				console.log('no games found');

				var newGameRequest = new gameRequest({
					username: socket.alias,
					gametype: request['gametype'],
					loc: searchpoint,
					dist: request['dist'],
					available: request['available'],
					players: request['players']
				});

				newGameRequest.save( function (err, newGameRequest) {
					console.log("Created New Match: " + JSON.stringify(newGameRequest));
					console.log(JSON.stringify(newGameRequest.loc));
				});

				var newRoomName = newGameRequest._id;	// user the request id for the initial request as a room name
				socket.leave(socket.room);
				socket.join(newRoomName);
				socket.room = newRoomName;

				var userResponse = {'type' : 'MATCHWAITING'};
				socket.emit('notification', userResponse);

			} else {
				console.log('match found for request');
				console.log(JSON.stringify(results));
				requestMatch = results[0];

				requestMatch.available = requestMatch.available - 1; // one joined

				var newRoomName = requestMatch._id;
				socket.leave(socket.room);
				socket.join(newRoomName);
				socket.room = newRoomName;

				var userResponse = {'type' : 'MATCHFOUND', 'alias': socket.alias};
				socket.emit('notification', userResponse);

				// WE NEED TO TELL THE NEW PLAYER ABOUT ALL THE OLD PLAYERS
				clients = io.sockets.clients(socket.room);
				for (var i = 0; i < clients.length; i=i+1) {
					if (socket.alias != clients[i].alias) {
						var newResponse = {'type' : 'PLAYERFOUND', 'alias' : clients[i].alias};
						socket.emit('notification', newResponse);
					}
				}

				var allResponse = {'type' : 'PLAYERFOUND', 'alias' : socket.alias};
				socket.broadcast.to(socket.room).emit('notification', allResponse);

				if (requestMatch.available == 0) {
					console.log("available " + requestMatch.available)
					requestMatch.remove();
					console.log('Removed an empty invite.')
					console.log('starting the match')

					var startResponse = {'type' : 'STARTMATCH', 'alias' : socket.alias};
					socket.broadcast.to(socket.room).emit('notification', startResponse);
					socket.emit('notification', startResponse); // we need to tell the person to start too
					//send match start code to everyone

				} else {
					requestMatch.save( function (err, newGameRequest) {
						console.log("Joined Match: " + JSON.stringify(newGameRequest));
					});
				}
			}
		});
	});

	// A user connected
	//socket.on('setAlias', function (data) {
	//	console.log("set user alias to: " + data);
	//	socket.set('alias', data);
	//});

	socket.on('message', function(message) { // message between clients might be in an array
		var data = { 'message' : message, alias : socket.alias };
		socket.broadcast.to(socket.room).emit('message', data);
		console.log("user " + socket.alias + " sent this: " + message);
	})
});

/*http.createServer(function (request, response) {
	response.writeHead(200, {'Content-Type': 'text/plain'});
	response.write('Current Game Request Here:\n');

	gameRequest.find({}).exec(function (err, result) {
		for (var i = 0; i<result.length; i ++) {
			response.write(result[i].username + ' wants to do ' + result[i].gametype + ' with ' + result[i].available + ' open spots.\n');
		}
	response.end();
	});
}).listen(8124);
*/