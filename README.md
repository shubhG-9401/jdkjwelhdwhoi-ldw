# Secure Course DRM Platform (Admin Portal with 2FA + PC Student Player)

A complete, enterprise-grade Digital Rights Management (DRM) course publishing and desktop playback ecosystem designed to prevent unauthorized sharing, pirating, and network inspection ripping.

---

## 🏗️ Architecture Overview

```mermaid
graph TD
    subgraph Admin["Admin Web Portal (2FA Authenticator Protected)"]
        Auth[Google Authenticator / TOTP 2FA Login] --> Dash[Admin Dashboard]
        Dash --> CE[Course Encryptor & Document Parser]
        Dash --> CM[Course & Curriculum Editor - Add/Remove Lessons]
        Dash --> LG[56-Character License Generator]
        Dash --> SEC[Admin Security: Change Pass & Login ID]
        CE --> ENC[AES-256-GCM Encrypted .enc Container]
        CM --> ENC
    end

    subgraph Client["Student PC App & Player (Offline DRM)"]
        ENC -.-> Import[Student Imports .enc Package]
        Key[56-Character Student License Key] --> V{DRM Verification API}
        HWID[PC Hardware UUID] --> V
        IPv4[Dual-Stack IPv4] --> V
        IPv6[Dual-Stack IPv6] --> V
        V -- "Valid (1 IP + 1 HWID)" --> RAM[In-Memory WebCrypto AES-GCM Decryption]
        V -- "Mismatch" --> BLK[Access Denied & Security Log]
        RAM --> LMS[LMS Learning Platform]
        LMS --> Proxy[DRM Streaming Proxy: URL Masking]
        Proxy --> VID[HLS Video Player .m3u8]
        LMS --> PDF[Sandboxed In-Memory PDF Viewer]
        LMS --> DOC[Markdown & Telegram Community Hub]
        LMS --> WM[Dynamic Moving Anti-Piracy Watermark]
    end
```

---

## 🛡️ Core Security & Anti-Piracy Features

1. **Admin Portal 2FA Authenticator (RFC 6238 TOTP)**:
   - Full authentication gateway requiring Login ID, Password, and 6-digit Authenticator code (Google Authenticator, Microsoft Authenticator, Authy).
   - QR Code display for quick pairing.
   - Ability to update Login ID, change password, and re-pair Authenticator keys from the portal.

2. **Course Content Management (Add / Remove Lessons & Modules)**:
   - Interactive visual curriculum manager to add/remove video lessons, PDFs, telegram channels, images, or notes.
   - Re-encrypts with the same master key in RAM so existing student licenses stay 100% valid.

3. **56-Character License Keys & Dual-Stack Network Binding**:
   - Every student license key is **exactly 56 characters long**.
   - Binds to both **IPv4 and IPv6** addresses on initial login, blocking network sharing.
   - Hardware ID (HWID) binding prevents opening the course on unauthorized PCs.

4. **Network Inspection Masking (DRM Streaming Proxy)**:
   - Video sources (e.g. Wistia Cloudfront `.m3u8` streams) are proxied and masked through ephemeral `/api/drm/stream/playlist.m3u8?token=...` routes.
   - Raw video URLs are never visible in the browser's DevTools Network tab.

5. **Zero-Disk In-Memory Decryption**:
   - The `.enc` container is decrypted directly inside RAM using Web Crypto API.
   - Decrypted video files or PDFs are never saved to the student's hard drive or temp directories.

6. **Anti-Recording Moving Watermark**:
   - Dynamic watermark displaying student name, bound IPv4/IPv6, and live timestamp hops across the video and document canvas every 12 seconds.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18+
- **Operating System**: Windows 10/11 (64-bit)

### 2. Start the Server
```powershell
npm run server
```
- **Admin Portal**: [http://localhost:3000/admin](http://localhost:3000/admin)
- **Student Player**: [http://localhost:3000/student](http://localhost:3000/student)

---

## 🔑 Default Administrator Credentials

- **Login ID**: `admin`
- **Password**: `admin123`
- **Authenticator (TOTP) Secret**: `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP`
  *(You can scan the QR code directly from the login page or enter this secret into Google Authenticator)*

---

## 🧪 Testing with Pre-Seeded Sigma 12 Course

1. Open **[http://localhost:3000/student](http://localhost:3000/student)**.
2. Click **"Auto-Load Sigma 12 Package"** (or select `sigma_12_encrypted.enc`).
3. Enter your 56-character license key:
   ```text
   RP88278T3A4UTFBDNYVTL8EYD8BUCCJUX23RYU9DX8BCA22Y4ERD5FFB
   ```
4. Click **Verify 56-Char Key & Decrypt Course**.

---

## 📦 GitHub Repository

- **Private Repository**: [https://github.com/shubhG-9401/jdkjwelhdwhoi-ldw](https://github.com/shubhG-9401/jdkjwelhdwhoi-ldw)
