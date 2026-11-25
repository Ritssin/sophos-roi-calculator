// Optional: bundle index.html + css + js into ONE offline HTML file (easy to email or drop in Teams).
// Usage: node tools/build-single-file.js [output.html]   (no dependencies)
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const out = process.argv[2] || path.join(root, "Sophos_ROI_Calculator.html");
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, f) => "<style>\n" + fs.readFileSync(path.join(root, f), "utf8") + "\n</style>");
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => "<script>\n" + fs.readFileSync(path.join(root, f), "utf8").replace(/<\/script/gi, "<\\/script") + "\n</script>");
fs.writeFileSync(out, html);
console.log("Wrote " + out + " (" + Math.round(html.length / 1024) + " KB)");
