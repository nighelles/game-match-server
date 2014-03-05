from twisted.internet import protocol, reactor

from peewee import *

from struct import *

#initial setup to connect to the SQL database
db = MySQLDatabase('gamedatabase',user='code')

try:
	db.connect()
except:
	print "db connection error"
	
# definitions for SQL handling of users and game requests

class GameDataBaseModel(Model):
	class Meta:
		database = db
		
class GameRequest(GameDataBaseModel):
	longitude = DecimalField(9,6)
	latitude = DecimalField(9,6)
	name = CharField(20)
	game = CharField(20)
	available = IntegerField()

class User(GameDataBaseModel):
	userid = IntegerField()
	name = CharField(20)
		
# definitions for different types of request from the user

IDENTIFY 	= 0
GAMEREQUEST	= 1
SENDDATA	= 2
NEWUSER		= 3
RESET		= 4

#definitions for communication codes to send back to user

ERRORCODE		= 0

IDENTIFYCODEOK		= 1
IDENTIFYCODEFAIL	= 2

NEWUSEROK		= 3
NEWUSERFAIL		= 4

REQUESTWAIT		= 5
REQUESTFOUND		= 6

DATACODE		= 7
LEFTCODE		= 8

MATCHSTART		= 9


# objects to keep track of users, and allow communication between them

users = {}

# initialize the game requests database

GameRequest.delete()

# start protocal for handling incoming connections

class Game(protocol.Protocol):
	def connectionMade(self):
		print "Opened Connection"
		self.user = 0
		self.request = 0
		self.users = {}
		self.gameStarted = 0
		
	def reset(self):
		#function to handle the player wanting to reset their game
		#or make a new request without worring about the old one
		
		# First tell everyone we're talking to that we're leaving
		# This handles if we're in a game
		for userkey in self.users:
			leftmessage = str(pack("b",LEFTCODE) + self.user.username)
			self.users[senduserkey].transport.write(leftmessage)
			self.users[userkey].users.pop(self.user.name,None)
			
		# Then make sure we're no longer in the list of waiting players
		# This handles if we were waiting for a response
		if self.user != 0:
			users.pop(self.user.name,None)
		if self.request != 0:
			print "Deleting a user request"
			self.request.delete_instance()
			
		self.request = 0
		self.users = {}
		self.gameStarted = 0
		
	def connectionLost(self, reason):
		# First tell everyone we're talking to that we're leaving
		# This handles if we're in a game
		self.reset()
		self.transport.loseConnection()
	
	def dataReceived(self,data): 
		# this is all asynchronous, so we have to handle data correctly without context
		# message format for incoming messages
		
		# FIX that nothing happens when you disconnect
		# FIX generally nothing is communicated back to client
		
		# IDENTIFY USER		0:username:
		# GAME REQUEST		1:game:longitude:latitude:tolerance:openspots:
		# SEND DATA			2:data
		# NEW USER			3:username:
		# LEAVE				4:
		
		command = int(data[0])
		
		if (command == IDENTIFY):
			cmd,username,endline = data.split(":")
			print "Trying to Identify user with username: " + username
			self.identifyUser(username)
			
		if (command == GAMEREQUEST):
			cmd,game,longitude,latitude,tolerance,availabile,endline = data.split(":")
			print "Game request for: " + game + " At: " + longitude + " -- " + latitude
			self.gameRequest(game,float(longitude),float(latitude),float(tolerance),int(available))
			
		if (command == SENDDATA):
			self.sendData(data[2:])
			
		if (command == NEWUSER):
			cmd,username,endline = data.split(":")
			self.newUser(username)
			
		if (command == RESET):
			self.reset()
		
	def userCommunicateCode(self,communicateCode):
		communique = pack("b",communicateCode)
		self.transport.write(communique)
		
	def identifyUser(self,username):
		# figure out which user we're dealing with, so we can get their userid
		currentUsers = User.select().where(User.name==username)
		if currentUsers.count() != 0:
			self.user = currentUsers[0]
			print "Identified user as " + self.user.name + " with id: " + str(self.user.id)
			
			self.userCommunicateCode(IDENTIFYCODEOK)
			
		else:
			print "User could not be identified"
			self.user = 0 
			
			# probably handle telling the person their username doesn't work or something
			self.userCommunicateCode(IDENTIFYCODEFAIL)
			
	def newUser(self,username):
		print "Requesting new user for username: ",username
		currentUsers = User.select().where(User.name==username)
		if currentUsers.count() != 0:
			print "Username already exists, no creation" 
			# here we should handle communicating back to the app
			# to inform them that the username is taken 
			self.userCommunicateCode(NEWUSERFAIL)
			
		else:
			print "Available, creating it"
			newuser = User()
			newuser.name = username
			newuser.save()
			# save the new user, still have to call the identify user code as usual
			self.userCommunicateCode(NEWUSEROK)
			
	def gameRequest(self,game,longitude,latitude,tolerance,available):
		# now we can either find a request that's already there, or make one to wait
		# FIRST look for requests that match the one that we already have
		tolerance = tolerance/70 # This is a really rough hack to get approximate longitude/latitude difference in miles
		
		matchingRequests = GameRequest.select().where(
			(GameRequest.game==game) & 
			(GameRequest.latitude < (latitude + tolerance)) & 
			(GameRequest.latitude > (latitude - tolerance)) &
			(GameRequest.longitude < (longitude + tolerance)) & 
			(GameRequest.longitude > (latitude - tolerance)) ) \
			.order_by(GameRequest.id) # this is so we fairly choose the oldest request
			# it shouldn't matter if a later player has a larger tolerance than us, because they'll travel
		
		if matchingRequests.count() != 0:
			# We found one or more matches, so pick the first one of them, the oldest
			selectedRequest = matchingRequests[0]
			print "Found match for this game, with user: ",selectedRequest.name
			
			#now we need to tell the Game processes about each other
			self.users[selectedRequest.name] = users[selectedRequest.name] 	#copy their object into our list of users in match

			for userkey in users[selectedRequest.name].users:		#copy our name into all existing members in match
				users[selectedRequest.name].users[userkey].users[self.user.name] = self
				users[selectedRequest.name].userCommunicateCode(REQUESTFOUND)
			
			users[selectedRequest.name].users[self.user.name] = self	#copy our name into their list of users in match
			self.userCommunicateCode(REQUESTFOUND)
			
			#handle removing requests:
			selectedRequest.available = selectedRequest.available - 1
			selectedRequest.save()

			if selectedRequest.available == 0:
				selectedRequest.delete_instance() #we can remove the request from the database
				for userkey in users[selectedRequest.name].users:
					users[selectedRequest.name].users[userkey].userCommunicateCode(MATCHSTART)
				users[selectedRequest.name].userCommunicateCode(MATCHSTART)

				users.pop(selectedRequest.name, None) # Remove them from the list of waiting users
			
		else:
			# We didn't find any matches, so we need to create a new GameRequest for this request and add it.
			# Then we wait for another person with a matching request to find us
			newgame = GameRequest()
			newgame.longitude = longitude
			newgame.latitude = latitude
			newgame.name = self.user.name
			newgame.game = game
			newgame.available = available
			newgame.save()
			self.request = newgame
			
			print "No match found, created new match",newgame.longitude,newgame.latitude,self.user.name,game,newgame.id,available
			
			# add this user's Game object to the list of waiting users, so we can communicate back and forth
			# when someone else finds us for a match
			users[self.user.name] = self
			
			self.userCommunicateCode(REQUESTWAIT)
	
	def sendData(self,data):
		# This is simple, just send data to all of our connected users
		for senduserkey in self.users:
			data = str(pack("b",DATACODE) + data)
			self.users[senduserkey].transport.write(data)
			
		# data sending is fire and forget, don't worry about confirming it
	
class GameFactory(protocol.Factory): # this class creates a new Game instance for each new connection
	def buildProtocol(self, addr):
		return Game()
		
reactor.listenTCP(1234,GameFactory())
reactor.run()
