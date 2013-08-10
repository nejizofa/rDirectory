var express = require('express')
    , routes = require('./routes')
    , directory = require('./routes/directory')
    , thankyou = require('./routes/thankyou')
    , http = require('http')
    , path = require('path')
    , _ = require('lodash')
    , request = require('request')
//    , Crawler = require("crawler").Crawler
//    , fs = require("fs");

var app = express();

// all environments
app.set('port', process.env.PORT || 8080);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.static(path.join(__dirname, 'public')));
app.use(app.router);


// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.post('/:schoolName/thankyou', thankyou.index);
app.post('/thankyou', thankyou.index);
app.get('/:schoolName/areyouit', routes.index);
app.get('/:schoolName/areyouit/:campusId', routes.index);
app.get('/', directory.index);

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});




