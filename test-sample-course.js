import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { db } from './server/db.js';
import { encryptCourseBundle, generateRandomKey } from './server/cryptoEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateSampleCourse() {
  console.log('--- Generating Pre-Encrypted Demo Course & License ---');

  // 1. Prepare asset files
  // A. Sample Video
  const videoPath = path.join(__dirname, 'sample_video.mp4');
  let videoBuffer;
  if (fs.existsSync(videoPath)) {
    videoBuffer = fs.readFileSync(videoPath);
  } else {
    videoBuffer = Buffer.from('Mock video buffer for testing');
  }

  // B. Sample PDF (valid PDF 1.4 multi-page document)
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 280 >>
stream
BT
/F1 22 Tf
50 720 Td
(SECURE COURSE DRM - CHAPTER 1 GUIDE) Tj
/F1 12 Tf
0 -40 Td
(Welcome to the Protected Educational Masterclass.) Tj
0 -25 Td
(This entire document was decrypted securely inside your computer RAM.) Tj
0 -25 Td
(No raw unencrypted files are ever dumped to your hard drive.) Tj
0 -25 Td
(Watermark tracking is active for anti-piracy protection.) Tj
ET
endstream
endobj
6 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>
endobj
7 0 obj
<< /Length 260 >>
stream
BT
/F1 20 Tf
50 720 Td
(CHAPTER 1: ADVANCED ARCHITECTURE DIAGRAMS) Tj
/F1 12 Tf
0 -40 Td
(1. Single IP Restriction: Strict firewall enforcement per student.) Tj
0 -25 Td
(2. Hardware Lock: Tied to the student's unique PC processor/UUID.) Tj
0 -25 Td
(3. AES-256-GCM authenticated cipher with randomized IV.) Tj
ET
endstream
endobj
xref
0 8
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000121 00000 n 
0000000250 00000 n 
0000000339 00000 n 
0000000671 00000 n 
0000000800 00000 n 
trailer
<< /Size 8 /Root 1 0 R >>
startxref
1112
%%EOF`;
  const pdfBuffer = Buffer.from(pdfContent, 'utf8');

  // C. Sample Document / Notes
  const docContent = `# Module 1: Comprehensive Course Notes & Code Walkthrough

Welcome to the **Encrypted Learning Environment**.

This course has been encrypted with **AES-256-GCM** cryptography to protect the instructor's intellectual property.

## Key Features of this Platform:
- **Zero-Disk Leakage**: All files are decrypted into ephemeral memory buffers.
- **Hardware Binding**: Your license is locked directly to your PC's hardware fingerprint.
- **Single IP Address Enforcement**: Only one authorized IP connection is permitted per student.
- **Dynamic Moving Watermark**: Prevents screen capturing by embedding your identity directly across the video and document viewport.

\`\`\`javascript
// Example Code Snippet:
const secureSession = {
  status: 'PROTECTED',
  cipher: 'AES-256-GCM',
  inMemoryOnly: true
};
console.log('Learning environment active:', secureSession);
\`\`\`

Feel free to browse the video lectures and PDF handouts using the curriculum sidebar on the left!
`;
  const docBuffer = Buffer.from(docContent, 'utf8');

  // 2. Build Course Manifest
  const courseId = 'crs_demo_masterclass';
  const encryptionKeyHex = generateRandomKey(); // Random 256-bit AES key

  const manifest = {
    courseId,
    title: 'Complete Software Architecture Masterclass 2026',
    description: 'Encrypted offline masterclass with HD video lectures, architectural blueprints, and student notes.',
    createdAt: new Date().toISOString(),
    modules: [
      {
        moduleTitle: 'Module 1: Orientation & Foundations',
        lessons: [
          {
            id: 'les_1',
            title: '1. Course Introduction & Welcome',
            type: 'video',
            filename: 'intro_lecture.mp4'
          },
          {
            id: 'les_2',
            title: '2. Architecture Blueprint & Syllabus',
            type: 'pdf',
            filename: 'architecture_guide.pdf'
          },
          {
            id: 'les_3',
            title: '3. Lecture Notes & Core Concepts',
            type: 'doc',
            filename: 'module1_notes.md'
          }
        ]
      }
    ]
  };

  const files = [
    { filename: 'intro_lecture.mp4', buffer: videoBuffer },
    { filename: 'architecture_guide.pdf', buffer: pdfBuffer },
    { filename: 'module1_notes.md', buffer: docBuffer }
  ];

  // 3. Encrypt the Course Bundle
  const encryptedBuffer = encryptCourseBundle(courseId, encryptionKeyHex, manifest, files);

  // Save .enc file to encrypted_storage
  const storageDir = path.join(__dirname, 'server', 'encrypted_storage');
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

  const encFileName = 'software_architecture_masterclass_demo.enc';
  const encFilePath = path.join(storageDir, encFileName);
  fs.writeFileSync(encFilePath, encryptedBuffer);

  // Also copy a duplicate directly to student-app for convenience
  const studentCopyPath = path.join(__dirname, 'student-app', encFileName);
  fs.writeFileSync(studentCopyPath, encryptedBuffer);

  // Also copy to root for immediate drag-and-drop
  const rootCopyPath = path.join(__dirname, encFileName);
  fs.writeFileSync(rootCopyPath, encryptedBuffer);

  // 4. Save Course in DB
  const courseRecord = {
    id: courseId,
    title: manifest.title,
    description: manifest.description,
    encryptedFileName: encFileName,
    encryptedFilePath: encFilePath,
    fileSize: encryptedBuffer.length,
    fileCount: files.length,
    encryptionKeyHex,
    manifest,
    createdAt: new Date().toISOString()
  };
  db.saveCourse(courseRecord);

  // 5. Create Demo Student License
  const demoLicenseKey = 'LIC-DEMO-2026-PASS';
  const demoLicense = {
    licenseKey: demoLicenseKey,
    courseId,
    courseTitle: manifest.title,
    customerName: 'Alex Kumar (Demo Student)',
    customerEmail: 'alex.kumar@example.com',
    ipLockMode: 'first_login', // Auto-binds to the student's IP on 1st login
    allowedIp: null,
    boundIp: null, // Will bind automatically upon testing!
    boundHwid: null, // Will bind automatically upon testing!
    status: 'active',
    createdAt: new Date().toISOString(),
    activatedAt: null,
    lastAccessAt: null
  };
  db.saveLicense(demoLicense);

  db.addLog({
    action: 'demo_seeded',
    status: 'granted',
    courseId,
    licenseKey: demoLicenseKey,
    studentName: demoLicense.customerName,
    message: `Pre-seeded demo course and license created successfully.`
  });

  console.log(`\n======================================================`);
  console.log(` DEMO COURSE SEEDED SUCCESSFULLY!`);
  console.log(` Course:       ${manifest.title}`);
  console.log(` Encrypted:    ${encFileName} (${(encryptedBuffer.length / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(` Location:     ${rootCopyPath}`);
  console.log(` Demo License: ${demoLicenseKey}`);
  console.log(` Student:      ${demoLicense.customerName}`);
  console.log(`======================================================\n`);
}

generateSampleCourse();
