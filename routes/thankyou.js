exports.index = function(req, res){
    var mysql      = require('mysql');
    var connection = mysql.createConnection({
        host     : 'pmaedb.ca5ujtx5dzto.us-west-1.rds.amazonaws.com',
        user     : 'pmaelive',
        password : 'blind4cr3',
        database : 'pmaelive'
    });

    connection.connect();
    var name = req.body.name;
    name = name.trim();
    name = name.split(" ");

    var address = {addressee_firstname: name[0], addressee_lastname: name[1]};
    connection.query('INSERT INTO typef_address SET ?', address, function(err, result){
        //if(err) throw err;

        var person = {campusid: req.body.campusid, firstname: name[0], lastname: name[1], addressid: result.insertId, datecreated: new Date()};
        connection.query('INSERT INTO typef_person SET ?', person, function(err, result) {
            if (err) return;

            var email = {personid: result.insertId, email: req.body.email, descr: 'Personal', main:1};

            connection.query('INSERT INTO typef_person_email SET ?', email, function(err, result){
            });

            var phone = {personid: result.insertId, phone: req.body.phone, descr: 'Home Mobile', main:1};
            connection.query('INSERT INTO typef_person_phone SET ?', phone, function(err, result){
            });
            var enroll = {enrollid: result.insertId, source: "Directory", sourcetext: "PaulMitchell Directory Leads"};
            connection.query('INSERT INTO pmae_enroll SET ?', enroll, function(err, result){
            })
            if(req.body.note != '')
            {
                var note = {linkid: result.insertId, linktype: 'enroll', note: req.body.note , datecreated: new Date()};
                connection.query('INSERT INTO typef_note SET ?', note, function(err, result){
                })
            }
            connection.end();
        });
    });

    res.render('thankyou', { title: 'Paul Mitchell the School -- Directory' });
};