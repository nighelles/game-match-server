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
   console.log('collection removed') 
});

var testRequest = new gameRequest({
	username: 'nighelles',
	gametype: 'Server Development',
	loc: [-122.264,37.866],
	dist: 1,
	available: 1
});

testRequest.save(function (err, testRequest) {
	if (err) return console.error(err);
});

var http = require('http');

http.createServer(function (request, response) {
	response.writeHead(200, {'Content-Type': 'text/plain'});
	response.write('Current Game Request Here:\n');

	gameRequest.find({}).exec(function (err, result) {
		for (var i = 0; i<result.length; i ++) {
			response.write(result[i].username + ' wants to do ' + result[i].gametype + ' with ' + result[i].available + ' open spots.\n');
		}
	response.end();
	});
}).listen(8124);
