var pkBaseURL = (("https:" == document.location.protocol) ? "https://analytics.centerhive.com/" : "http://analytics.centerhive.com/");
document.write(unescape("%3Cscript src='" + pkBaseURL + "piwik.js' type='text/javascript'%3E%3C/script%3E"));

try {
    var piwikTracker = Piwik.getTracker(pkBaseURL + "piwik.php", 6);

    piwikTracker.trackPageView();
    piwikTracker.enableLinkTracking();
    console.log('Success');
} catch( err ) {
    console.log(err);
}