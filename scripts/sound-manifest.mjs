// public/sounds/ 에 있는 mp3 파일 목록을 manifest.json 으로 적는다. dev와 build 전에 자동으로 돈다.
// 화면은 이 목록에 있는 소리만 받아 오고, 없는 소리는 합성음으로 대신하거나 생략한다.
import fs from 'node:fs';

const dir = new URL('../public/sounds/', import.meta.url);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort();
fs.writeFileSync(new URL('manifest.json', dir), JSON.stringify(files) + '\n');
console.log(`sounds: ${files.length}개`);
