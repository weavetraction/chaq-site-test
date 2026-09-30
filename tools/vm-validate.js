/* Vehicle Master 검증 스크립트 (Node)
   사용:  node tools/vm-validate.js [pages/data/vehicle-master.js]
   · 참조 무결성 / 중복 ID / enum / 가격 정책 / 이미지 상태 / Source 누락 을 점검한다.
   · 화면 Helper(vehicle-master-helper.js)의 validate() 를 그대로 사용하므로 브라우저와 동일 규칙. */
var fs = require("fs"), path = require("path"), vm = require("vm");
var file = process.argv[2] || path.join(__dirname, "..", "pages", "data", "vehicle-master.js");
var ctx = { window: {} }; ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
global.window = ctx.window;
var VM = require(path.join(__dirname, "..", "pages", "data", "vehicle-master-helper.js"));
VM.load(ctx.window.CHAQ_VEHICLE_MASTER);
var r = VM.validate();
console.log("file      :", file);
console.log("schema    :", r.schemaVersion, "/", r.schemaStatus);
console.log("counts    :", JSON.stringify(r.counts));
console.log("imageStat :", JSON.stringify(r.imageStatus));
console.log("errors    :", r.errors.length); r.errors.forEach(function (e) { console.log("  ✖", e); });
console.log("warnings  :", r.warnings.length); r.warnings.slice(0, 50).forEach(function (w) { console.log("  △", w); });
if (r.warnings.length > 50) console.log("  … " + (r.warnings.length - 50) + " more");
process.exit(r.ok ? 0 : 1);
