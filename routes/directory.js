exports.index = function(req, res){

    var params = {};
    params.title = 'Beauty and Cosmetology | Paul Mitchell the School Directory | Nails and Barbering';
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