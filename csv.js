/**
 * @name CSV
 * @namespace
 */
// implemented as a singleton because JS is single threaded
var CSV = {};
CSV.RELAXED = false;
CSV.IGNORE_RECORD_LENGTH = false;
CSV.IGNORE_QUOTES = false;
CSV.LINE_FEED_OK = true;
CSV.DETECT_TYPES = true;
CSV.IGNORE_QUOTE_WHITESPACE = true;
CSV.DEBUG = false;

CSV.ERROR_EOF = "UNEXPECTED_END_OF_FILE";
CSV.ERROR_CHAR = "UNEXPECTED_CHARACTER";
CSV.ERROR_EOL = "UNEXPECTED_END_OF_RECORD";
CSV.WARN_SPACE = "UNEXPECTED_WHITESPACE"; // not per spec, but helps debugging

var QUOTE = "\"",
    CR = "\r",
    LF = "\n",
    COMMA = ",",
    SPACE = " ",
    TAB = "\t";

// states
var PRE_TOKEN = 0,
    MID_TOKEN = 1,
    POST_TOKEN = 2,
    POST_RECORD = 4;
/**
 * @name CSV.parse
 * @function
 * @description rfc4180 standard csv parse
 * with options for strictness and data type conversion
 * By default, will automatically type-cast numeric an boolean values.
 * @param {String} str A CSV string
 * @return {Array} An array records, each of which is an array of scalar values.
 * @example
 * // simple
 * var rows = CSV.parse("one,two,three\nfour,five,six")
 * // rows equals [["one","two","three"],["four","five","six"]]
 * @example
 * // Though not a jQuery plugin, it is recommended to use with the $.ajax pipe() method:
 * $.get("csv.txt")
 *    .pipe( CSV.parse )
 *    .done( function(rows) {
 *        for( var i =0; i < rows.length; i++){
 *            console.log(rows[i])
 *        }
 *  });
 * @see http://www.ietf.org/rfc/rfc4180.txt
 */
CSV.parse = function (str) {
    var result = CSV.result = [];
    CSV.offset = 0;
    CSV.str = str;
    CSV.record_begin();

    CSV.debug("parse()", str);

    var c;
    while( 1 ){
        // pull char
        c = str[CSV.offset++];
        CSV.debug("c", c);

        // detect eof
        if (c == null) {
            if( CSV.escaped )
                CSV.error(CSV.ERROR_EOF);

            if( CSV.record ){
                CSV.token_end();
                CSV.record_end();
            }

            CSV.debug("...bail", c, CSV.state, CSV.record);
            CSV.reset();
            break;
        }

        if( CSV.record == null ){
            // if relaxed mode, ignore blank lines
            if( CSV.RELAXED && (c == LF || c == CR && str[CSV.offset + 1] == LF) ){
                continue;
            }
            CSV.record_begin();
        }

        // pre-token: look for start of escape sequence
        if (CSV.state == PRE_TOKEN) {

            if ( (c === SPACE || c === TAB) && CSV.next_nonspace() == QUOTE ){
                if( CSV.RELAXED || CSV.IGNORE_QUOTE_WHITESPACE ) {
                    continue;
                }
                else {
                    // not technically an error, but ambiguous and hard to debug otherwise
                    CSV.warn(CSV.WARN_SPACE);
                }
            }

            if (c == QUOTE && ! CSV.IGNORE_QUOTES) {
                CSV.debug("...escaped start", c);
                CSV.escaped = true;
                CSV.state = MID_TOKEN;
                continue;
            }
            CSV.state = MID_TOKEN;
        }

        // mid-token and escaped, look for sequences and end quote
        if (CSV.state == MID_TOKEN && CSV.escaped) {
            if (c == QUOTE) {
                if (str[CSV.offset] == QUOTE) {
                    CSV.debug("...escaped quote", c);
                    CSV.token += QUOTE;
                    CSV.offset++;
                }
                else {
                    CSV.debug("...escaped end", c);
                    CSV.escaped = false;
                    CSV.state = POST_TOKEN;
                }
            }
            else {
                CSV.token += c;
                CSV.debug("...escaped add", c, CSV.token);
            }
            continue;
        }

        // fall-through: mid-token or post-token, not escaped
        if (c == CR && str[CSV.offset + 1] == LF) {
            CSV.offset++;
            CSV.state = POST_RECORD;
            CSV.token_end();
        }
        else if (c == LF) {
            if( ! (CSV.LINE_FEED_OK || CSV.RELAXED) )
                CSV.error(CSV.ERROR_CHAR);
            CSV.token_end();
            CSV.state = POST_RECORD;
        }
        else if (c == COMMA) {
            CSV.token_end();
            continue;
        }
        else if( CSV.state == MID_TOKEN ){
            CSV.token += c;
            CSV.debug("...add", c, CSV.token);
        }
        else if ( c === SPACE || c === TAB) {
            if ( CSV.IGNORE_QUOTE_WHITESPACE )
                continue;
            else
                CSV.error(CSV.WARN_SPACE );
        }
        else if( ! CSV.RELAXED ){
            CSV.error(CSV.ERROR_CHAR);
        }

        if( CSV.state == POST_RECORD ){
            CSV.record_end();
        }

    }
    return result;
};

CSV.reset = function () {
    CSV.state = null;
    CSV.token = null;
    CSV.escaped = null;
    CSV.record = null;
    CSV.offset = null;
    CSV.result = null;
    CSV.str = null;
};

CSV.next_nonspace = function () {
    var i = CSV.offset;
    var c;
    while( i < CSV.str.length ) {
        c = CSV.str[i++];
        if( !( c == SPACE || c === TAB ) ){
            return c;
        }
    }
    return null;
};

CSV.record_begin = function () {
    CSV.escaped = false;
    CSV.record = [];
    CSV.token_begin();
    CSV.debug("record_begin");
};

CSV.record_end = function () {
    if( ! (CSV.IGNORE_RECORD_LENGTH || CSV.RELAXED)
        && CSV.result.length > 0 && CSV.record.length !=  CSV.result[0].length ){
        CSV.error(CSV.ERROR_EOL);
    }
    CSV.result.push(CSV.record);
    CSV.debug("record end", CSV.record);
    CSV.record = null;
};

CSV.resolve_type = function (token) {
    if( token.match(/^\d+(\.\d+)?$/) ){
        token = parseFloat(token);
    }
    else if( token.match(/^true|false$/i) ){
        token = Boolean( token.match(/true/i) );
    }
    else if(token === "undefined" ){
        token = undefined;
    }
    else if(token === "null" ){
        token = null;
    }
    return token;
};

CSV.token_begin = function () {
    CSV.state = PRE_TOKEN;
    // considered using array, but http://www.sitepen.com/blog/2008/05/09/string-performance-an-analysis/
    CSV.token = "";
};

CSV.token_end = function () {
    if( CSV.DETECT_TYPES ) {
        CSV.token = CSV.resolve_type(CSV.token);
    }
    CSV.record.push(CSV.token);
    CSV.debug("token end", CSV.token);
    CSV.token_begin();
};

CSV.debug = function (){
    if( CSV.DEBUG )
        console.log(arguments);
};

CSV.dump = function (msg) {
    return [
        msg , "at char", CSV.offset, ":",
        CSV.str.substr(CSV.offset- 50, 50)
            .replace(/\r/mg,"\\r")
            .replace(/\n/mg,"\\n")
            .replace(/\t/mg,"\\t")
    ].join(" ");
}


CSV.error = function (err){
    var msg = CSV.dump(err);
    CSV.reset();
    throw msg;
};

CSV.warn = function (err){
    var msg = CSV.dump(err);
    try {
        console.warn( msg )
        return;
    } catch (e) {};

    try {
        console.log( msg )
        return;
    } catch (e) {};


};


var stateProperties = [
    {"id":"01","name":"Alabama"}
    ,{"id":"02","name":"Alaska"}
    ,{"id":"04","name":"Arizona"}
    ,{"id":"05","name":"Arkansas"}
    ,{"id":"06","name":"California"}
    ,{"id":"08","name":"Colorado"}
    ,{"id":"09","name":"Connecticut"}
    ,{"id":"10","name":"Delaware"}
    ,{"id":"11","name":"District of Columbia"}
    ,{"id":"12","name":"Florida"}
    ,{"id":"13","name":"Georgia"}
    ,{"id":"15","name":"Hawaii"}
    ,{"id":"16","name":"Idaho"}
    ,{"id":"17","name":"Illinois"}
    ,{"id":"18","name":"Indiana"}
    ,{"id":"19","name":"Iowa"}
    ,{"id":"20","name":"Kansas"}
    ,{"id":"21","name":"Kentucky"}
    ,{"id":"22","name":"Louisiana"}
    ,{"id":"23","name":"Maine"}
    ,{"id":"24","name":"Maryland"}
    ,{"id":"25","name":"Massachusetts"}
    ,{"id":"26","name":"Michigan"}
    ,{"id":"27","name":"Minnesota"}
    ,{"id":"28","name":"Mississippi"}
    ,{"id":"29","name":"Missouri"}
    ,{"id":"30","name":"Montana"}
    ,{"id":"31","name":"Nebraska"}
    ,{"id":"32","name":"Nevada"}
    ,{"id":"33","name":"New Hampshire"}
    ,{"id":"34","name":"New Jersey"}
    ,{"id":"35","name":"New Mexico"}
    ,{"id":"36","name":"New York"}
    ,{"id":"37","name":"North Carolina"}
    ,{"id":"38","name":"North Dakota"}
    ,{"id":"39","name":"Ohio"}
    ,{"id":"40","name":"Oklahoma"}
    ,{"id":"41","name":"Oregon"}
    ,{"id":"42","name":"Pennsylvania"}
    ,{"id":"44","name":"Rhode Island"}
    ,{"id":"45","name":"South Carolina"}
    ,{"id":"46","name":"South Dakota"}
    ,{"id":"47","name":"Tennessee"}
    ,{"id":"48","name":"Texas"}
    ,{"id":"49","name":"Utah"}
    ,{"id":"50","name":"Vermont"}
    ,{"id":"51","name":"Virginia"}
    ,{"id":"53","name":"Washington"}
    ,{"id":"54","name":"West Virginia"}
    ,{"id":"55","name":"Wisconsin"}
    ,{"id":"56","name":"Wyoming"}
    ,{"id":"72","name":"Puerto Rico"}
];

var schoolImages = [
    {
        "url": "http://cincinnati.paulmitchell.edu/cincinnati-oh",
        "fileName": "/98b04d7fd548754809e4bac9496ef994.png",
        "campusId": "5"
    },
    {
        "url": "http://school.paulmitchell.edu/st-louis-mo",
        "fileName": "/e58847dc015d337a9bf924306dd58b40.png",
        "campusId": "46"
    },
    {
        "url": "http://imagine.paulmitchell.edu/norman-ok",
        "fileName": "/9d74f09a195f776719253ba943842a71.png",
        "campusId": "11"
    },
    {
        "url": "http://cactus.paulmitchell.edu/garden-city-ny",
        "fileName": "/c2f0d6ec08a78f61cb5790138966d1dc.png",
        "campusId": "3"
    },
    {
        "url": "http://imagine.paulmitchell.edu/little-rock-ar",
        "fileName": "/9d74f09a195f776719253ba943842a71.png",
        "campusId": "10"
    },
    {
        "url": "http://school.paulmitchell.edu/indianapolis-in",
        "fileName": "/4aa74d06c66ffa467b4aee442397f33a.png",
        "campusId": "38"
    },
    {
        "url": "http://school.paulmitchell.edu/normal-il",
        "fileName": "/e96a340abb0f7fcddef0adb403b3f0a2.png",
        "campusId": "37"
    },
    {
        "url": "http://school.paulmitchell.edu/tulsa-ok",
        "fileName": "/9790d74b12e3b6c0afb104e71b022d1f.png",
        "campusId": "109"
    },
    {
        "url": "http://school.paulmitchell.edu/sherman-oaks-ca",
        "fileName": "/e7da2ce829dc350819b97bbf582dd872.png",
        "campusId": "28"
    },
    {
        "url": "http://raleigh.paulmitchell.edu/raleigh-nc",
        "fileName": "/66eb8657e98bfbb8a42fa9ec8013a582.png",
        "campusId": "77"
    },
    {
        "url": "http://pasadena.paulmitchell.edu/alhambra-ca",
        "fileName": "/1b396cdb6898e894d2d9668aa649bb15.png",
        "campusId": "74"
    },
    {
        "url": "http://school.paulmitchell.edu/jacksonville-fl",
        "fileName": "/4371b93471b62461c384d6dfb1275bb0.png",
        "campusId": "32"
    },
    {
        "url": "http://school.paulmitchell.edu/atlanta-ga",
        "fileName": "/d725d58ee64e683338d9efac03501c37.png",
        "campusId": "35"
    },
    {
        "url": "http://school.paulmitchell.edu/port-huron-mi",
        "fileName": "/d01c4cb75c7b482b47df5b72e4674f62.png",
        "campusId": "44"
    },
    {
        "url": "http://lab.paulmitchell.edu/ewing-nj",
        "fileName": "/5b974305cdd0fead31912c307c903be6.png",
        "campusId": "80"
    },
    {
        "url": "http://school.paulmitchell.edu/overland-park-ks",
        "fileName": "/423bc4e3d3d01a07af1dccbe474ae041.png",
        "campusId": "39"
    },
    {
        "url": "http://boise.paulmitchell.edu/boise-id",
        "fileName": "/5709f137cf8c19db166a240a3652e553.png",
        "campusId": "68"
    },
    {
        "url": "http://school.paulmitchell.edu/orlando-fl",
        "fileName": "/2e5fd4f8d8feca78a928a7b24a525a78.png",
        "campusId": "33"
    },
    {
        "url": "http://wisconsin.paulmitchell.edu/peshtigo-wi",
        "fileName": "/31fd1b627b6c905c79a0ac03b73ab09c.png",
        "campusId": "88"
    },
    {
        "url": "http://school.paulmitchell.edu/tampa-fl",
        "fileName": "/0866cca245f9adbf12b660a0d19ce812.png",
        "campusId": "34"
    },
    {
        "url": "http://school.paulmitchell.edu/murfreesboro-tn",
        "fileName": "/cdb00a4550ca6bb0fdac71bd5cda1a70.png",
        "campusId": "52"
    },
    {
        "url": "http://school.paulmitchell.edu/escanaba-mi",
        "fileName": "/eb150a866008c85953893afaa66d72f6.png",
        "campusId": "43"
    },
    {
        "url": "http://michaels.paulmitchell.edu/bedford-nh",
        "fileName": "/2ec33b27affc9b70be1f36b9301d4d61.png",
        "campusId": "14"
    },
    {
        "url": "http://waukesha.paulmitchell.edu/waukesha-wi",
        "fileName": "/b420487f04d03cf7159c432744f5f1f9.png",
        "campusId": "72"
    },
    {
        "url": "http://nyc.paulmitchell.edu/staten-island-ny",
        "fileName": "/bf8a0156aa967c7e90a000a2aa8b612c.png",
        "campusId": "71"
    },
    {
        "url": "http://jz.paulmitchell.edu/bismarck-nd",
        "fileName": "/fd8fd56364d96213ac4a23fc4a7d363f.png",
        "campusId": "13"
    },
    {
        "url": "http://school.paulmitchell.edu/east-bay-ca",
        "fileName": "/8df7c5d277716bf8e599e10181046436.png",
        "campusId": "24"
    },
    {
        "url": "http://school.paulmitchell.edu/sterling-heights-mi",
        "fileName": "/4decc27ae897864c387f256ea3c59911.png",
        "campusId": "45"
    },
    {
        "url": "http://school.paulmitchell.edu/houston-tx",
        "fileName": "/db51c88b4833ce9c6b1eafe623445e57.png",
        "campusId": "55"
    },
    {
        "url": "http://esani.paulmitchell.edu/alpharetta-ga",
        "fileName": "/2c7f0abe95834e2d3fc3ed0b58e8b374.png",
        "campusId": "78"
    },
    {
        "url": "http://hi-tech.paulmitchell.edu/miami-fl",
        "fileName": "/66ad9e371984d7f9921608f241ca3bfc.png",
        "campusId": "9"
    },
    {
        "url": "http://school.paulmitchell.edu/wichita-ks",
        "fileName": "/c97e2fae0873d860d6c80c6c0e1bc3c6.png",
        "campusId": "40"
    },
    {
        "url": "http://school.paulmitchell.edu/greenville-sc",
        "fileName": "/GREENVILLE.png",
        "campusId": "119"
    },
    {
        "url": "http://ohio.paulmitchell.edu/cleveland-oh",
        "fileName": "/097d38f863a3fbbb9c5b35ff6086121f.png",
        "campusId": "82"
    },
    {
        "url": "http://ardmore.paulmitchell.edu/ardmore-ok",
        "fileName": "/0e3fdfd6c5cb14194a3a6a22b9a8f177.png",
        "campusId": "116"
    },
    {
        "url": "http://knoxville.paulmitchell.edu/knoxville-tn",
        "fileName": "/fa6ab36d14d27fefbc9e7e60290e0def.png",
        "campusId": "105"
    },
    {
        "url": "http://school.paulmitchell.edu/mclean-va",
        "fileName": "/60ff43a37555e7fad404ff1e83152de7.png",
        "campusId": "60"
    },
    {
        "url": "http://temple.paulmitchell.edu/frederick-md",
        "fileName": "/adf5eacb8538e89f9d57ac679a52c181.png",
        "campusId": "85"
    },
    {
        "url": "http://jersey-shore.paulmitchell.edu/brick-nj",
        "fileName": "/78db4774f44755cce9b003b25e744333.png",
        "campusId": "12"
    },
    {
        "url": "http://austin.paulmitchell.edu/austin-tx",
        "fileName": "/6976bf618c4e063cb6ac49b4cee15e96.png",
        "campusId": "70"
    },
    {
        "url": "http://honolulu.paulmitchell.edu/honolulu-hi",
        "fileName": "/885f375986b418cbbedf184a0d38e483.png",
        "campusId": "91"
    },
    {
        "url": "http://davenport.paulmitchell.edu/davenport-ia",
        "fileName": "/002668c8d9fcd9fe0332b94071fa41c5.png",
        "campusId": "7"
    },
    {
        "url": "http://school.paulmitchell.edu/portland-or",
        "fileName": "/a1999e1f4d5ec3febbde4765a853c2ad.png",
        "campusId": "49"
    },
    {
        "url": "http://north-haven.paulmitchell.edu/north-haven-ct",
        "fileName": "/2e2f5cee345e3d64172c9dd7c956a384.png",
        "campusId": "16"
    },
    {
        "url": "http://school.paulmitchell.edu/danbury-ct",
        "fileName": "/04174b76ec9fc9a568bbdcb096b5ac6b.png",
        "campusId": "31"
    },
    {
        "url": "http://hair-expressions.paulmitchell.edu/rockville-md",
        "fileName": "/62c3279a72d6b4f82e43f88085fdae36.png",
        "campusId": "8"
    },
    {
        "url": "http://school.paulmitchell.edu/colorado-springs-co",
        "fileName": "/c9b62c173a0b767fae817966abbe029e.png",
        "campusId": "29"
    },
    {
        "url": "http://trend-setters.paulmitchell.edu/bradley-il",
        "fileName": "/a279b9a9060cfe4c8117ca4d8db2e58a.png",
        "campusId": "89"
    },
    {
        "url": "http://school.paulmitchell.edu/spokane-wa",
        "fileName": "/d44747babe405269087514bd6433cbea.png",
        "campusId": "61"
    },
    {
        "url": "http://carolina.paulmitchell.edu/gastonia-nc",
        "fileName": "/8e66879bf76c9bd7eb6aa686426649e4.png",
        "campusId": "4"
    },
    {
        "url": "http://safavi.paulmitchell.edu/modesto-ca",
        "fileName": "/025c8b4c29f7237a7847e4a35feb2145.png",
        "campusId": "66"
    },
    {
        "url": "http://pulse.paulmitchell.edu/downingtown-pa",
        "fileName": "/2d95b947f9be682be01957c174407e32.png",
        "campusId": "64"
    },
    {
        "url": "http://school.paulmitchell.edu/st-george-ut",
        "fileName": "/797f61af23390ad1c09aa2fa263a8777.png",
        "campusId": "59"
    },
    {
        "url": "http://school.paulmitchell.edu/provo-ut",
        "fileName": "/e15512b6fa73a487028f8555d631ee72.png",
        "campusId": "57"
    },
    {
        "url": "http://school.paulmitchell.edu/nashville-tn",
        "fileName": "/81b53c5efd41fd10342caf232b7ae87b.png",
        "campusId": "54"
    },
    {
        "url": "http://school.paulmitchell.edu/denver-co",
        "fileName": "/f2cfb422ddafafff538924880bb8e228.png",
        "campusId": "30"
    },
    {
        "url": "http://jessup.paulmitchell.edu/jessup-md",
        "fileName": "/64b68ffe9c1ccc7bddef4e0e9db29501.png",
        "campusId": "114"
    },
    {
        "url": "http://school.paulmitchell.edu/chicago-il",
        "fileName": "/81e27c70896a1369d8e3d7018e37c151.png",
        "campusId": "36"
    },
    {
        "url": "http://system.paulmitchell.edu/springfield-mo",
        "fileName": "/SPRINGFIELD.png",
        "campusId": "84"
    },
    {
        "url": "http://vanguard.paulmitchell.edu/slidell-la",
        "fileName": "/ecebc0a90d5f06ff4479e0d0a717e8c9.png",
        "campusId": "93"
    },
    {
        "url": "http://school.paulmitchell.edu/monroe-wi",
        "fileName": "/d676188202129a88544e329b6c72cb1e.png",
        "campusId": "62"
    },
    {
        "url": "http://delaware.paulmitchell.edu/newark-de",
        "fileName": "/9c73b8451066e22a282170261f84c3f8.png",
        "campusId": "76"
    },
    {
        "url": "http://school.paulmitchell.edu/fayetteville-ar",
        "fileName": "/164edfa1a83b95dbb9b43b1c5f540874.png",
        "campusId": "22"
    },
    {
        "url": "http://school.paulmitchell.edu/salt-lake-city-ut",
        "fileName": "/corporate-logo.png",
        "campusId": "58"
    },
    {
        "url": "http://bella-capelli.paulmitchell.edu/pittsburgh-pa",
        "fileName": "/09cbbec9ff5688df5c471fcf4a63fc6c.png",
        "campusId": "2"
    },
    {
        "url": "http://school.paulmitchell.edu/louisville-ky",
        "fileName": "/30d8854728d88b73c93c9c7c3e53a740.png",
        "campusId": "42"
    },
    {
        "url": "http://school.paulmitchell.edu/lombard-il",
        "fileName": "/5b8e3f79dc9b3d38f17e91a0fe98220c.png",
        "campusId": "120"
    },
    {
        "url": "http://school.paulmitchell.edu/las-vegas-nv",
        "fileName": "/390f906e3c9f7e6b42227e50e7654e99.png",
        "campusId": "47"
    },
    {
        "url": "http://school.paulmitchell.edu/huntsville-al",
        "fileName": "/9d31db22dfded20e9ce25928460c04ce.png",
        "campusId": "20"
    },
    {
        "url": "http://rudy-kelly.paulmitchell.edu/virginia-beach-va",
        "fileName": "/98212939a3fdbf74d83a8e682a213163.png",
        "campusId": "65"
    },
    {
        "url": "http://parisian.paulmitchell.edu/hackensack-nj",
        "fileName": "/6ff7b3ca2442f9dbdddf0bc3b813ba10.png",
        "campusId": "19"
    },
    {
        "url": "http://school.paulmitchell.edu/lexington-ky",
        "fileName": "/4da95cf97c83e43e677e59f499c90a0b.png",
        "campusId": "41"
    },
    {
        "url": "http://hair-academy.paulmitchell.edu/rexburg-id",
        "fileName": "/3a07830da7823ed99f2e6c654a41ea4f.png",
        "campusId": "79"
    },
    {
        "url": "http://school.paulmitchell.edu/schenectady-ny",
        "fileName": "/5ae73b9b365a44fe3600c943ee27cd12.png",
        "campusId": "97"
    },
    {
        "url": "http://vanguard.paulmitchell.edu/metairie-la",
        "fileName": "/ecebc0a90d5f06ff4479e0d0a717e8c9.png",
        "campusId": "98"
    },
    {
        "url": "http://sacramento.paulmitchell.edu/sacramento-ca",
        "fileName": "/c203f16975ecdbb371813442a3bb079a.png",
        "campusId": "73"
    },
    {
        "url": "http://school.paulmitchell.edu/charleston-sc",
        "fileName": "/981ae0c145dbb3c5f6274de8e914eaf1.png",
        "campusId": "63"
    },
    {
        "url": "http://temecula.paulmitchell.edu/temecula-ca",
        "fileName": "/5fb02347473c5af66ae9fa7e779ac998.png",
        "campusId": "75"
    },
    {
        "url": "http://reno.paulmitchell.edu/reno-nv",
        "fileName": "/43bcea938fbf3abb47a2b61817d5ca6c.png",
        "campusId": "83"
    },
    {
        "url": "http://trend-setters.paulmitchell.edu/tinley-park-il",
        "fileName": "/2edcd344b6d95e14eb350450cca4a30d.png",
        "campusId": "90"
    },
    {
        "url": "http://vanguard.paulmitchell.edu/baton-rouge-la",
        "fileName": "/ecebc0a90d5f06ff4479e0d0a717e8c9.png",
        "campusId": "92"
    },
    {
        "url": "http://school.paulmitchell.edu/ogden-ut",
        "fileName": "/e2883ff8fadd376d80ccd54f5874bfc5.png",
        "campusId": "112"
    },
    {
        "url": "http://san-francisco.paulmitchell.edu/san-francisco-ca",
        "fileName": "/fc2400b63cd72fcf8108b1f81e5b5e50.png",
        "campusId": "67"
    },
    {
        "url": "http://dallas.paulmitchell.edu/arlington-tx",
        "fileName": "/1176a4a7fb5bc34a870dd23e21c44a18.png",
        "campusId": "106"
    },
    {
        "url": "http://school.paulmitchell.edu/santa-barbara-ca",
        "fileName": "/39d6c0a9362fcfd2e6a6bc03981b3bc3.png",
        "campusId": "27"
    },
    {
        "url": "http://school.paulmitchell.edu/woodbridge-va",
        "fileName": "/7e75d725689f3f6eb0785cbd4920413a.png",
        "campusId": "113"
    },
    {
        "url": "http://school.paulmitchell.edu/fayetteville-nc",
        "fileName": "/2e72800d69d9b07ec3f733b352a09a21.png",
        "campusId": "48"
    },
    {
        "url": "http://school.paulmitchell.edu/san-antonio-tx",
        "fileName": "/9ae88a10fa0d964832cf29731d36f682.png",
        "campusId": "56"
    },
    {
        "url": "http://school.paulmitchell.edu/bartlett-tn",
        "fileName": "/ccd9fc966b83a2f42c07c3c302b13cca.png",
        "campusId": "53"
    },
    {
        "url": "http://bella-capelli.paulmitchell.edu/monroeville-pa",
        "fileName": "/09cbbec9ff5688df5c471fcf4a63fc6c.png",
        "campusId": "1"
    },
    {
        "url": "http://school.paulmitchell.edu/cranston-ri",
        "fileName": "/b8b7950c9192125537c00a00d7d69925.png",
        "campusId": "50"
    },
    {
        "url": "http://greenbay.paulmitchell.edu/green-bay-wi",
        "fileName": "/87c6f2607cc85943f07392183d58cb21.png",
        "campusId": "104"
    },
    {
        "url": "http://dallas.paulmitchell.edu/dallas-tx",
        "fileName": "/b283d06d97d94e48cc898ccefff86ab3.png",
        "campusId": "6"
    },
    {
        "url": "http://school.paulmitchell.edu/phoenix-az",
        "fileName": "/55c38038f428544a827008a615aec941.png",
        "campusId": "21"
    },
    {
        "url": "http://school.paulmitchell.edu/san-diego-ca",
        "fileName": "/cd49e3398da258af1e8014f151dbd290.png",
        "campusId": "26"
    },
    {
        "url": "http://school.paulmitchell.edu/columbia-sc",
        "fileName": "/001ff54084e9f3fb68d249a7f116bd89.png",
        "campusId": "51"
    },
    {
        "url": "http://mti.paulmitchell.edu/sacramento-ca",
        "fileName": "/4394dce89b0be7bfabb36c3ff7939dfd.png",
        "campusId": "15"
    },
    {
        "url": "http://fort-myers.paulmitchell.edu/fort-myers-fl",
        "fileName": "/435446d1e093d89ccd6ad233322a2d36.png",
        "campusId": "108"
    },
    {
        "url": "http://carolina.paulmitchell.edu/charlotte-nc",
        "fileName": "/8caf942a144beaa6ec1abafea3f76713.png",
        "campusId": "102"
    },
    {
        "url": "http://birmingham.paulmitchell.edu/birmingham-al",
        "fileName": "/fcbf37bcc654149dd64e277c51dde908.png",
        "campusId": "94"
    },
    {
        "url": "http://school.paulmitchell.edu/fresno-ca",
        "fileName": "/9006662a54ff551f6551e6f01a3d2fca.png",
        "campusId": "25"
    },
    {
        "url": "http://ohio.paulmitchell.edu/columbus-oh",
        "fileName": "/9f5461f36e3d03a50bb2af6a4ec05f05.png",
        "campusId": "81"
    },
    {
        "url": "http://school.paulmitchell.edu/costa-mesa-ca",
        "fileName": "/c426e6396c62bd4a34b7df71fc632518.png",
        "campusId": "23"
    },
    {
        "url": "http://school.paulmitchell.edu/portsmouth-nh",
        "fileName": "/PORTSMOUTH.jpg",
        "campusId": "121"
    }
];
var fs = require('fs');

fs.readFile("./pmae_campus.csv", 'utf8', function(err, data){
    if(err) throw err;

    var rows = CSV.parse( data );
    var columns = rows[0];
    rows.shift(); //remove the columns

    var outArr = [];
    for (var i = 0; i<rows.length; i++)
    {
        var values = rows[i];
        var pushObj = {};
        for (var d=0; d<columns.length; d++)
        {
            pushObj[columns[d]] = values[d];
        }
        outArr.push(pushObj);
    }

    rows = outArr;
    var propCopy = stateProperties;
    for(var key in stateProperties)
    {
        var result = [];
        _.each(rows, function(obj){
            if(obj.state === stateProperties[key].name)
            {
                _.each(schoolImages, function(imageObj){
                    console.log(imageObj.campusId);
                    console.log(obj.campusid);
                    if(imageObj.campusId == obj.campusid)
                    {
                        console.log("found one");
                        result.push({"name": obj.campusname, "address": obj.address, "city": obj.city, "state": obj.state, "zip": obj.zip, "logo": imageObj.fileName, "url": imageObj.url, "campusid": imageObj.campusId});
                        return false;
                    }
                })

            }
        });
        propCopy[key].schools = result;
        console.log(propCopy[key]);
    }

    fs.writeFile("./public/stateProperties.txt", JSON.stringify(propCopy), function(err){
        if(err)
        {
            throw err;
        }
        else
        {
            console.log("File Written Successfully");
        }
    })
})
/*var download = function(uri, filename){
 request.head(uri, function(err, res, body){
 console.log('content-type:', res.headers['content-type']);
 console.log('content-length:', res.headers['content-length']);

 request(uri).pipe(fs.createWriteStream(filename, "w+"));
 });
 };



 /*var schoolList = [{"url":"http://cincinnati.paulmitchell.edu/cincinnati-oh","campusId":"5"},{"url":"http://school.paulmitchell.edu/st-louis-mo","campusId":"46"},{"url":"http://imagine.paulmitchell.edu/norman-ok","campusId":"11"},{"url":"http://cactus.paulmitchell.edu/garden-city-ny","campusId":"3"},{"url":"http://imagine.paulmitchell.edu/little-rock-ar","campusId":"10"},{"url":"http://school.paulmitchell.edu/indianapolis-in","campusId":"38"},{"url":"http://school.paulmitchell.edu/normal-il","campusId":"37"},{"url":"http://school.paulmitchell.edu/tulsa-ok","campusId":"109"},{"url":"http://school.paulmitchell.edu/sherman-oaks-ca","campusId":"28"},{"url":"http://raleigh.paulmitchell.edu/raleigh-nc","campusId":"77"},{"url":"http://pasadena.paulmitchell.edu/alhambra-ca","campusId":"74"},{"url":"http://school.paulmitchell.edu/jacksonville-fl","campusId":"32"},{"url":"http://school.paulmitchell.edu/atlanta-ga","campusId":"35"},{"url":"http://school.paulmitchell.edu/port-huron-mi","campusId":"44"},{"url":"http://lab.paulmitchell.edu/ewing-nj","campusId":"80"},{"url":"http://school.paulmitchell.edu/overland-park-ks","campusId":"39"},{"url":"http://boise.paulmitchell.edu/boise-id","campusId":"68"},{"url":"http://school.paulmitchell.edu/orlando-fl","campusId":"33"},{"url":"http://wisconsin.paulmitchell.edu/peshtigo-wi","campusId":"88"},{"url":"http://school.paulmitchell.edu/tampa-fl","campusId":"34"},{"url":"http://school.paulmitchell.edu/murfreesboro-tn","campusId":"52"},{"url":"http://school.paulmitchell.edu/escanaba-mi","campusId":"43"},{"url":"http://michaels.paulmitchell.edu/bedford-nh","campusId":"14"},{"url":"http://waukesha.paulmitchell.edu/waukesha-wi","campusId":"72"},{"url":"http://nyc.paulmitchell.edu/staten-island-ny","campusId":"71"},{"url":"http://jz.paulmitchell.edu/bismarck-nd","campusId":"13"},{"url":"http://school.paulmitchell.edu/east-bay-ca","campusId":"24"},{"url":"http://school.paulmitchell.edu/sterling-heights-mi","campusId":"45"},{"url":"http://school.paulmitchell.edu/houston-tx","campusId":"55"},{"url":"http://esani.paulmitchell.edu/alpharetta-ga","campusId":"78"},{"url":"http://hi-tech.paulmitchell.edu/miami-fl","campusId":"9"},{"url":"http://school.paulmitchell.edu/wichita-ks","campusId":"40"},{"url":"http://school.paulmitchell.edu/greenville-sc","campusId":"119"},{"url":"http://ohio.paulmitchell.edu/cleveland-oh","campusId":"82"},{"url":"http://ardmore.paulmitchell.edu/ardmore-ok","campusId":"116"},{"url":"http://knoxville.paulmitchell.edu/knoxville-tn","campusId":"105"},{"url":"http://school.paulmitchell.edu/mclean-va","campusId":"60"},{"url":"http://temple.paulmitchell.edu/frederick-md","campusId":"85"},{"url":"http://jersey-shore.paulmitchell.edu/brick-nj","campusId":"12"},{"url":"http://austin.paulmitchell.edu/austin-tx","campusId":"70"},{"url":"http://honolulu.paulmitchell.edu/honolulu-hi","campusId":"91"},{"url":"http://davenport.paulmitchell.edu/davenport-ia","campusId":"7"},{"url":"http://school.paulmitchell.edu/portland-or","campusId":"49"},{"url":"http://north-haven.paulmitchell.edu/north-haven-ct","campusId":"16"},{"url":"http://school.paulmitchell.edu/danbury-ct","campusId":"31"},{"url":"http://hair-expressions.paulmitchell.edu/rockville-md","campusId":"8"},{"url":"http://school.paulmitchell.edu/colorado-springs-co","campusId":"29"},{"url":"http://trend-setters.paulmitchell.edu/bradley-il","campusId":"89"},{"url":"http://school.paulmitchell.edu/spokane-wa","campusId":"61"},{"url":"http://carolina.paulmitchell.edu/gastonia-nc","campusId":"4"},{"url":"http://safavi.paulmitchell.edu/modesto-ca","campusId":"66"},{"url":"http://pulse.paulmitchell.edu/downingtown-pa","campusId":"64"},{"url":"http://school.paulmitchell.edu/st-george-ut","campusId":"59"},{"url":"http://school.paulmitchell.edu/provo-ut","campusId":"57"},{"url":"http://school.paulmitchell.edu/nashville-tn","campusId":"54"},{"url":"http://school.paulmitchell.edu/denver-co","campusId":"30"},{"url":"http://jessup.paulmitchell.edu/jessup-md","campusId":"114"},{"url":"http://school.paulmitchell.edu/chicago-il","campusId":"36"},{"url":"http://system.paulmitchell.edu/springfield-mo","campusId":"84"},{"url":"http://vanguard.paulmitchell.edu/slidell-la","campusId":"93"},{"url":"http://school.paulmitchell.edu/monroe-wi","campusId":"62"},{"url":"http://delaware.paulmitchell.edu/newark-de","campusId":"76"},{"url":"http://school.paulmitchell.edu/fayetteville-ar","campusId":"22"},{"url":"http://school.paulmitchell.edu/salt-lake-city-ut","campusId":"58"},{"url":"http://bella-capelli.paulmitchell.edu/pittsburgh-pa","campusId":"2"},{"url":"http://school.paulmitchell.edu/louisville-ky","campusId":"42"},{"url":"http://school.paulmitchell.edu/lombard-il","campusId":"120"},{"url":"http://school.paulmitchell.edu/las-vegas-nv","campusId":"47"},{"url":"http://school.paulmitchell.edu/huntsville-al","campusId":"20"},{"url":"http://rudy-kelly.paulmitchell.edu/virginia-beach-va","campusId":"65"},{"url":"http://parisian.paulmitchell.edu/hackensack-nj","campusId":"19"},{"url":"http://school.paulmitchell.edu/lexington-ky","campusId":"41"},{"url":"http://hair-academy.paulmitchell.edu/rexburg-id","campusId":"79"},{"url":"http://school.paulmitchell.edu/schenectady-ny","campusId":"97"},{"url":"http://vanguard.paulmitchell.edu/metairie-la","campusId":"98"},{"url":"http://sacramento.paulmitchell.edu/sacramento-ca","campusId":"73"},{"url":"http://school.paulmitchell.edu/charleston-sc","campusId":"63"},{"url":"http://temecula.paulmitchell.edu/temecula-ca","campusId":"75"},{"url":"http://reno.paulmitchell.edu/reno-nv","campusId":"83"},{"url":"http://trend-setters.paulmitchell.edu/tinley-park-il","campusId":"90"},{"url":"http://vanguard.paulmitchell.edu/baton-rouge-la","campusId":"92"},{"url":"http://school.paulmitchell.edu/ogden-ut","campusId":"112"},{"url":"http://san-francisco.paulmitchell.edu/san-francisco-ca","campusId":"67"},{"url":"http://dallas.paulmitchell.edu/arlington-tx","campusId":"106"},{"url":"http://school.paulmitchell.edu/santa-barbara-ca","campusId":"27"},{"url":"http://school.paulmitchell.edu/woodbridge-va","campusId":"113"},{"url":"http://school.paulmitchell.edu/fayetteville-nc","campusId":"48"},{"url":"http://school.paulmitchell.edu/san-antonio-tx","campusId":"56"},{"url":"http://school.paulmitchell.edu/bartlett-tn","campusId":"53"},{"url":"http://bella-capelli.paulmitchell.edu/monroeville-pa","campusId":"1"},{"url":"http://school.paulmitchell.edu/cranston-ri","campusId":"50"},{"url":"http://greenbay.paulmitchell.edu/green-bay-wi","campusId":"104"},{"url":"http://dallas.paulmitchell.edu/dallas-tx","campusId":"6"},{"url":"http://school.paulmitchell.edu/phoenix-az","campusId":"21"},{"url":"http://school.paulmitchell.edu/san-diego-ca","campusId":"26"},{"url":"http://school.paulmitchell.edu/columbia-sc","campusId":"51"},{"url":"http://mti.paulmitchell.edu/sacramento-ca","campusId":"15"},{"url":"http://fort-myers.paulmitchell.edu/fort-myers-fl","campusId":"108"},{"url":"http://carolina.paulmitchell.edu/charlotte-nc","campusId":"102"},{"url":"http://birmingham.paulmitchell.edu/birmingham-al","campusId":"94"},{"url":"http://school.paulmitchell.edu/fresno-ca","campusId":"25"},{"url":"http://ohio.paulmitchell.edu/columbus-oh","campusId":"81"},{"url":"http://school.paulmitchell.edu/costa-mesa-ca","campusId":"23"},{"url":"http://school.paulmitchell.edu/portsmouth-nh","campusId":"121"}];
 var schoolImages = "";

 /*fs.readFile("./public/schoolImages.txt", 'utf8', function(err, data){
 if(err) throw err;

 schoolImages = JSON.parse(data);

 _.each(schoolList, function(obj){

 for(var key in schoolImages)
 {
 //console.log(key);
 if(obj.url === schoolImages[key].url)
 {
 //console.log("found");
 //console.log(obj.url);
 schoolImages[key].campusId = obj.campusId;
 //console.log(schoolImages[key])
 break;
 }

 }
 //return false;
 /*request(obj.url, function (error, response, body) {
 if (!error && response.statusCode == 200) {
 //console.log(body) // Print the google web page.

 }
 })*/

/* var c = new Crawler({
 "maxConnections":10,

 // This will be called for each crawled page
 "callback":function(error,result,$) {
 var image = $('#logo');
 $("#logo").each(function(index,a) {
 var logoImg = a._attributes._nodes.src._ownerDocument._URL + a._attributes._nodes.src._nodeValue;
 var pathname = logoImg.substring(logoImg.lastIndexOf("/"));
 download(logoImg, './public/images'+pathname);
 schoolList[key].fileName = pathname;
 fs.writeFile("./public/schoolImages.txt", JSON.stringify(schoolList), function(err){
 if(err)
 {
 throw err;
 }
 else
 {
 console.log("File Written Successfully" + pathname);
 }
 })
 });
 }
 });

 c.queue(obj.url);*/

//return false;

/*});*/
//console.log(schoolImages);
/*fs.writeFile("./public/stateProperties.txt", JSON.stringify(schoolImages), function(err){
 if(err)
 {
 throw err;
 }
 else
 {
 console.log("File Written Successfully");
 }
 }) */
/* var rows = CSV.parse( data );
 var columns = rows[0];
 rows.shift(); //remove the columns

 var outArr = [];
 for (var i = 0; i<rows.length; i++)
 {
 var values = rows[i];
 var pushObj = {};
 for (var d=0; d<columns.length; d++)
 {
 pushObj[columns[d]] = values[d];
 }
 outArr.push(pushObj);
 }

 rows = outArr;
 var propCopy = stateProperties;
 for(var key in stateProperties)
 {
 var result = [];
 _.each(rows, function(obj){
 if(obj.state === stateProperties[key].name)
 {
 result.push({"name": obj.campusname, "address": obj.address, "city": obj.city, "state": obj.state, "zip": obj.zip, "logo": obj.logo, "mobilelogo": obj.mobilelogo, "printlogo": obj.printlogo, "altlogo": obj.altlogo});
 }
 });
 propCopy[key].schools = result;
 console.log(propCopy[key]);
 }

 fs.writeFile("./public/stateProperties.txt", JSON.stringify(propCopy), function(err){
 if(err)
 {
 throw err;
 }
 else
 {
 console.log("File Written Successfully");
 }
 }) */
//})
