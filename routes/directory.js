exports.index = function(req, res){

    var params = {};
    params.title = 'Paul Mitchell the School -- Directory';
    if(typeof req.params.leadSource != "undefined" && req.params.leadSource != null)
    {
        params.leadSource = req.params.leadSource;
    }
    else
    {
        params.leadSource = "Corporate";
    }
    req.session.leadSource = params.leadSource;
    res.render('directory', params);
};