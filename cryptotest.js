var bcrypt = require('bcrypt');

bcrypt.genSalt(10, function(err, salt) {
    bcrypt.hash("password", salt, function(err, hash) {
        console.log(hash);
    	
	   	bcrypt.compare("password", hash, function(err, res) {
	  	  console.log("Should be true: " + res);
		});

		bcrypt.compare("notpassword", hash, function(err, res) {
	    	console.log("Should be false:" + res);
		});
    });
});
