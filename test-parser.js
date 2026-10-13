import { parseCourseDocumentText } from './server/docParser.js';

const sample = `Course name :- Sigma 12
1.welcome to sigma
https://www.pdffiller.com/s/k_zyV2H-p
2 . Live sessions
   1. https://embed-cloudfront.wistia.com/deliveries/45ed8874a993895cdec4c4ab62e03ed3123f94b9.m3u8
   2. https://embed-cloudfront.wistia.com/deliveries/45ed8874a993895cdec4c4ab62e03ed3123f94b9.m3u8
   3. https://embed-cloudfront.wistia.com/deliveries/0b3c71c755926770a668cd45fab1210caf94871d.m3u8
   4. https://embed-cloudfront.wistia.com/deliveries/9e6e0420fb258ca63592a6456c613ad0bed3eef1.m3u8
3. telegram
   https://t.me/+OxL7CIMC5c03MjE9
4. introduction
   1. https://embed-cloudfront.wistia.com/deliveries/d2dcbdabc09822bded8bfbea344db4c44595943b.m3u8
   2. https://embed-cloudfront.wistia.com/deliveries/38acfcc098fb0d5215d53fb7f4563d406afc3968.m3u8
   3. https://embed-cloudfront.wistia.com/deliveries/3ee5894d7ec413bda0c24f55a6a5028688c62fcb.m3u8
   4. https://embed-cloudfront.wistia.com/deliveries/c69ee95be0785b9061ccfee490c167bfdea29159.m3u8
5. pre requirements
https://embed-cloudfront.wistia.com/deliveries/17d7e449d095832e9c7bc8b279dfc1cd23532510.m3u8
https://ibb.co/8LnvmC6P
6.Html level 1
https://embed-cloudfront.wistia.com/deliveries/a1add416a5c3312b7d5ff709ad4a0c8d2f1f704b.m3u8
https://embed-cloudfront.wistia.com/deliveries/32b3c15d038272a1c0ecef98064345b170b5c346.m3u8
https://embed-cloudfront.wistia.com/deliveries/67bb6f6309c73aa02f705ddb7bb9dc1f5b357b73.m3u8
https://embed-cloudfront.wistia.com/deliveries/efdb4f1fa10c160d92ba1ab6e07197166ab6ae39.m3u8
https://embed-cloudfront.wistia.com/deliveries/039a17e24e720ea8abf41f8f9f59d28fabf9f87d.m3u8
https://embed-cloudfront.wistia.com/deliveries/7d407c20e919f96ee6e93b023e9b0cc6e535c2ad.m3u8
https://embed-cloudfront.wistia.com/deliveries/67bb6f6309c73aa02f705ddb7bb9dc1f5b357b73.m3u8`;

const parsed = parseCourseDocumentText(sample);
console.log('Parsed courseName:', parsed.courseName);
console.log('Module count:', parsed.modules.length);
parsed.modules.forEach(m => {
  console.log(`\n--- ${m.moduleTitle} (${m.lessons.length} items) ---`);
  m.lessons.forEach(l => {
    console.log(`  [${l.type.toUpperCase()}] ${l.title} -> ${l.url || l.content}`);
  });
});
