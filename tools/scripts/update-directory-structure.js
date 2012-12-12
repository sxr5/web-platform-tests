
// convert from old-style test structure to new style

// XXX TODO
//  - make a master/ED and a CR branch (make that temp/CR and temp/unicorn)
//  - be non-destructive, just add missing directories when applicable
//  - move stuff around

var fs = require("fs")
,   pth = require("path")
,   _ = require("underscore")
,   jsdom = require("jsdom")
,   wrench = require("wrench")
,   mkdirp = require("mkdirp").sync
,   testDir = pth.join(__dirname, "../../tests")
,   MAX_DEPTH = 3
;

if (process.argv[2] !== "--force") {
    console.log([
        "################ WARNING #########################################"
    ,   "   As currently implemented, this script is very much destructive."
    ,   "   It will destroy the entire tests directory. For real."
    ,   "   If you *really* wish to run it, run it with --force."
    ,   "   Eventually, it will simply update the directory tree."
    ,   "################ /WARNING ########################################"
    ].join("\n"));
    process.exit(1);
}

console.log("Move harness and reporting dirs out of test.");
var harness = pth.join(testDir, "harness")
,   reporting = pth.join(testDir, "reporting");
if (fs.existsSync(harness)) wrench.copyDirSyncRecursive(harness, pth.join(testDir, "../harness"));
if (fs.existsSync(reporting)) wrench.copyDirSyncRecursive(reporting, pth.join(testDir, "../reporting"));

console.log("Delete the test directory.");
if (fs.existsSync(testDir)) wrench.rmdirSyncRecursive(testDir);
mkdirp(testDir);

var sections = {
    html:       "http://www.w3.org/html/wg/drafts/html/master/Overview.html"
,   canvas2d:   "http://www.w3.org/html/wg/drafts/2dcontext/html5_canvas/Overview.html"
,   microdata:  "http://www.w3.org/html/wg/drafts/microdata/master/Overview.html"
};

function walkTree ($, $el, list) {
    $el.find("> li").each(function () {
        var $li = $(this)
        ,   $a = $li.find("> a").first()
        ;
        // skip sections that don't have a number
        if (!/^\s*\d+/.test($a.text())) return;
        var href = $a.attr("href").replace(/^.*#/, "")
        ,   def = {
                id: href.toLowerCase()
                        .replace(/[^a-z0-9\-]/g, "-")
                        .replace(/\-{2,}/g, "-")
                        .replace(/(?:^\-|\-$)/g, "")
            ,   original_id: href
            }
        ,   $ol = $li.find("> ol").first()
        ;
        if ($ol.length) {
            def.children = [];
            walkTree($, $ol, def.children);
        }
        list.push(def);
    });
}

function extractSections (sec, secDir, spec, cb) {
    jsdom.env(
        spec
    ,   function (err, window) {
            if (err) return cb(err);
            jsdom.jQueryify(window, "https://ajax.googleapis.com/ajax/libs/jquery/1.8.3/jquery.min.js", function (window, $) {
                if (!$) return cb("$ was not defined");
                var $root = $("body > ol.toc").first()
                ,   tree = []
                ;
                walkTree($, $root, tree);
                cb(null, tree, sec, secDir);
            }
        );
    });
}

function makeDirs (base, tree, depth) {
    console.log("Making " + base + " at depth " + depth);
    for (var i = 0, n = tree.length; i < n; i++) {
        var sec = tree[i]
        ,   sane = sec.id
        ,   path = pth.join(base, sane)
        ;
        mkdirp(path);
        fs.writeFileSync(pth.join(path, ".gitkeep"), "", "utf8");
        if (sec.id !== sec.original_id) {
            fs.writeFileSync(pth.join(path, "original-id.json"), JSON.stringify({ original_id: sec.original_id}), "utf8");
        }
        if (sec.children && sec.children.length) {
            if (depth === 3) {
                fs.writeFileSync(pth.join(path, "contains.json"), JSON.stringify(sec.children, null, 4), "utf8");
            }
            else {
                makeDirs(path, sec.children, depth + 1);
            }
        }
    }
}

for (var sec in sections) {
    var secDir = pth.join(testDir, sec);
    mkdirp(secDir);
    console.log("Launching extraction for " + sec);
    extractSections(sec, secDir, sections[sec], function (err, toc, sec, secDir) {
        if (err) return console.log("ERROR: " + err);
        makeDirs(secDir, toc, 1);
    });
}
