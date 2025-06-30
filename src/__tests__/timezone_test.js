// タイムゾーン変換のテスト
const { toZonedTime, format } = require('date-fns-tz');

// サンプルのUTC時刻（例：2025-06-30T06:30:00.000Z = UTC 6:30）
const utcTimestamp = '2025-06-30T06:30:00.000Z';
const inputTime = new Date(utcTimestamp);

console.log('=== タイムゾーン変換テスト ===');
console.log(`UTC時刻: ${utcTimestamp}`);
console.log(`Date オブジェクト: ${inputTime.toISOString()}`);

// 各タイムゾーンでの変換テスト
const timezones = [
  'Asia/Tokyo',      // JST (UTC+9)
  'Asia/Kolkata',    // IST (UTC+5:30)
  'America/New_York', // EST/EDT (UTC-5/-4)
  'Europe/London'    // GMT/BST (UTC+0/+1)
];

timezones.forEach(timezone => {
  const userLocalTime = toZonedTime(inputTime, timezone);
  const timeStr = format(userLocalTime, 'HH:mm', { timeZone: timezone });
  
  console.log(`\n${timezone}:`);
  console.log(`  変換後: ${userLocalTime.toISOString()}`);
  console.log(`  表示時刻: ${timeStr}`);
});

console.log('\n=== 現在時刻でのテスト ===');
const now = new Date();
console.log(`現在のUTC時刻: ${now.toISOString()}`);

timezones.forEach(timezone => {
  const localTime = toZonedTime(now, timezone);
  const timeStr = format(localTime, 'HH:mm', { timeZone: timezone });
  
  console.log(`${timezone}: ${timeStr}`);
});