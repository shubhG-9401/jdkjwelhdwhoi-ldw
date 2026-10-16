import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { db } from './server/db.js';
import { encryptCourseBundle, generateRandomKey } from './server/cryptoEngine.js';
import { parseCourseDocumentText } from './server/docParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rawSyllabusText = `Course name :- Sigma 12
1. Welcome to Sigma 12!
https://www.pdffiller.com/s/k_zyV2H-p
2. Live Sessions
   1. https://embed-cloudfront.wistia.com/deliveries/45ed8874a993895cdec4c4ab62e03ed3123f94b9.m3u8
   2. https://embed-cloudfront.wistia.com/deliveries/45ed8874a993895cdec4c4ab62e03ed3123f94b9.m3u8
   3. https://embed-cloudfront.wistia.com/deliveries/0b3c71c755926770a668cd45fab1210caf94871d.m3u8
   4. https://embed-cloudfront.wistia.com/deliveries/9e6e0420fb258ca63592a6456c613ad0bed3eef1.m3u8
3. Important - Join Telegram!
   Telegram Channel Link
   https://t.me/+OxL7CIMC5c03MjE9
4. Introduction
   1. https://embed-cloudfront.wistia.com/deliveries/d2dcbdabc09822bded8bfbea344db4c44595943b.m3u8
   2. https://embed-cloudfront.wistia.com/deliveries/38acfcc098fb0d5215d53fb7f4563d406afc3968.m3u8
   3. https://embed-cloudfront.wistia.com/deliveries/3ee5894d7ec413bda0c24f55a6a5028688c62fcb.m3u8
   4. https://embed-cloudfront.wistia.com/deliveries/c69ee95be0785b9061ccfee490c167bfdea29159.m3u8
5. Prerequisites
https://embed-cloudfront.wistia.com/deliveries/17d7e449d095832e9c7bc8b279dfc1cd23532510.m3u8
https://ibb.co/8LnvmC6P
6. HTML (Level 1) - Part A
https://embed-cloudfront.wistia.com/deliveries/a1add416a5c3312b7d5ff709ad4a0c8d2f1f704b.m3u8
https://embed-cloudfront.wistia.com/deliveries/32b3c15d038272a1c0ecef98064345b170b5c346.m3u8
https://embed-cloudfront.wistia.com/deliveries/67bb6f6309c73aa02f705ddb7bb9dc1f5b357b73.m3u8
7. HTML (Level 1) - Part B
https://embed-cloudfront.wistia.com/deliveries/efdb4f1fa10c160d92ba1ab6e07197166ab6ae39.m3u8
https://embed-cloudfront.wistia.com/deliveries/039a17e24e720ea8abf41f8f9f59d28fabf9f87d.m3u8
https://embed-cloudfront.wistia.com/deliveries/7d407c20e919f96ee6e93b023e9b0cc6e535c2ad.m3u8
https://embed-cloudfront.wistia.com/deliveries/67bb6f6309c73aa02f705ddb7bb9dc1f5b357b73.m3u8`;

async function seedSigmaCourse() {
  console.log('--- Compiling & Encrypting Sigma 12 Course Package ---');

  const parsed = parseCourseDocumentText(rawSyllabusText);
  const courseId = 'crs_sigma12';
  const existingCourse = db.getCourseById(courseId);
  const encryptionKeyHex = (existingCourse && existingCourse.encryptionKeyHex) 
    ? existingCourse.encryptionKeyHex 
    : generateRandomKey();

  const manifest = {
    courseId,
    title: parsed.courseName,
    description: 'Sigma 12 Complete Program with Wistia HD Video Sessions, PDF Handouts, and Community Access.',
    createdAt: new Date().toISOString(),
    modules: parsed.modules
  };

  const encryptedBuffer = encryptCourseBundle(courseId, encryptionKeyHex, manifest, []);

  const storageDir = path.join(__dirname, 'server', 'encrypted_storage');
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

  const encFileName = 'sigma_12_encrypted.enc';
  const encFilePath = path.join(storageDir, encFileName);
  fs.writeFileSync(encFilePath, encryptedBuffer);

  // Copy to root directory for easy access
  const rootCopy = path.join(__dirname, encFileName);
  fs.writeFileSync(rootCopy, encryptedBuffer);

  const courseRecord = {
    id: courseId,
    title: parsed.courseName,
    description: manifest.description,
    encryptedFileName: encFileName,
    encryptedFilePath: encFilePath,
    fileSize: encryptedBuffer.length,
    moduleCount: parsed.modules.length,
    fileCount: 0,
    encryptionKeyHex,
    manifest,
    createdAt: new Date().toISOString()
  };
  db.saveCourse(courseRecord);

  // Generate an exact 56-character license key
  // 56 characters:
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(56);
  let sigmaLicenseKey = '';
  for (let i = 0; i < 56; i++) {
    sigmaLicenseKey += chars[bytes[i] % chars.length];
  }

  const licenseRecord = {
    licenseKey: sigmaLicenseKey,
    keyLength: sigmaLicenseKey.length, // exactly 56!
    courseId,
    courseTitle: parsed.courseName,
    customerName: 'Sigma 12 Verified Student',
    customerEmail: 'student@sigma12.com',
    ipLockMode: 'first_login',
    allowedIpv4: null,
    allowedIpv6: null,
    boundIpv4: null,
    boundIpv6: null,
    boundHwid: null,
    status: 'active',
    createdAt: new Date().toISOString(),
    activatedAt: null,
    lastAccessAt: null
  };
  db.saveLicense(licenseRecord);

  console.log(`\n========================================================================`);
  console.log(` SIGMA 12 COURSE ENCRYPTED & SEEDED SUCCESSFULLY!`);
  console.log(` Course Title:   ${parsed.courseName}`);
  console.log(` Modules:        ${parsed.modules.length} Modules (19 Lessons total)`);
  console.log(` Encrypted File: ${rootCopy}`);
  console.log(` 56-Char Key:    ${sigmaLicenseKey} (Length: ${sigmaLicenseKey.length})`);
  console.log(` Protection:     AES-256-GCM + Dual IPv4/IPv6 + HWID Lock`);
  console.log(`========================================================================\n`);
}

seedSigmaCourse();
