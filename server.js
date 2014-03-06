var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/test');

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function callback() {
	// connected succesfully to database
});

var gameRequestSchema = mongoose.Schema({
	username: String,
    gametype: String,
	loc:{ type: [Number], index: '2dsphere'},
    dist: Number,
    available: Number
});

var gameRequest = mongoose.model('gameRequest',gameRequestSchema);

gameRequest.remove({}, function(err) { 
	console.log('Old requests removed.') 
});

// create a test request
var testRequest = new gameRequest({
	username: 'nighelles',
	gametype: 'Server Development',
	loc: [-122.264,37.866],
	dist: 1,
	available: 1
});

// Save the new request that we just made
testRequest.save(function (err, testRequest) {
	if (err) return console.error(err);
});


// start what we'll expose to the client

var http = require('http').createServer(handler)
	, io = require('socket.io').listen(http)
	, fs = require('fs')

http.listen(80);

function handler(req, res) {
	fs.readFile(__dirname + '/index.html',
		function (err, data) {
			if (err) {
				res.writeHead(500);
				return res.end("Error loading index.html");
			}

			res.writeHead(200);
			res.end(data);
		});
	console.log('Responded to http request');
}

io.sockets.on('connection', function(socket) {
	var alias = "null";

	socket.room = 'waiting';
	socket.join(socket.room);

	socket.on('setAlias', function (data) {
		console.log("User + " + alias + " changed alias to: " + data);
		alias = data;
	});

	socket.on('gameRequest', function (request) {
		console.log('new game request');

		gameRequest.find({ gametype : request['gametype'] }).exec(function (err, results) {
			if (results.length == 0) {
				console.log('no games found');

				var newGameRequest = new gameRequest({
					username: alias,
					gametype: request['gametype'],
					loc: request['loc'],
					dist: request['dist'],
					available: request['available']
				});

				newGameRequest.save( function (err, newGameRequest) {
					console.log("Created New Match: " + JSON.stringify(newGameRequest));
				});

				var newRoomName = newGameRequest._id;	// user the request id for the initial request as a room name
				socket.leave(socket.room);
				socket.join(newRoomName);
				socket.room = newRoomName;

				var userResponse = {'type' : 'MATCHWAITING'};
				socket.emit('notification', userResponse);

			} else {
				console.log('match found for request');
				requestMatch = results[0];

				requestMatch.available = requestMatch.available - 1; // one joined

				if (requestMatch.available == 0) {

					requestMatch.remove();
					console.log('Removed an empty invite.')

				} else {
					requestMatch.save( function (err, newGameRequest) {
						console.log("Joined Match: " + JSON.stringify(newGameRequest));
					});
				}

				var newRoomName = requestMatch._id;
				socket.leave(socket.room);
				socket.join(newRoomName);
				socket.room = newRoomName;

				var userResponse = {'type' : 'MATCHFOUND'};
				socket.emit('notification', userResponse);

				var allResponse = {'type' : 'PLAYERFOUND', 'alias' : alias};
				socket.broadcast.to(socket.room).emit('notification', allResponse);
			}
		});
	});

	// A user connected
	//socket.on('setAlias', function (data) {
	//	console.log("set user alias to: " + data);
	//	socket.set('alias', data);
	//});

	socket.on('message', function(message) {
		var data = { 'message' : message, alias : alias };
		socket.broadcast.to(socket.room).emit('message', data);
		console.log("user " + alias + " sent this: " + message);
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