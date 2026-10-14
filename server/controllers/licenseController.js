import { db } from '../db.js';
import { generate56CharLicenseKey } from '../utils/token.js';
import { config } from '../config/index.js';

export const licenseController = {
  // Create a new Customer License with 56-Character Key and IPv4 / IPv6 Binding
  createLicense(req, res) {
    const {
      courseId,
      customerName,
      studentName,
      customerEmail,
      ipLockMode = 'first_login', // 'first_login' | 'strict'
      allowedIpv4 = null,
      allowedIpv6 = null,
      customLicenseKey = null
    } = req.body;

    const finalCustomerName = customerName || studentName;
    if (!courseId || !finalCustomerName) {
      return res.status(400).json({ error: 'Course ID and Customer Name are required.' });
    }

    const course = db.getCourseById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Selected course not found.' });
    }

    // Generate or use exactly 56-character license key
    let licenseKey = (customLicenseKey || '').trim().toUpperCase();
    if (!licenseKey || licenseKey.length !== config.licenseKeyLength) {
      licenseKey = generate56CharLicenseKey();
    }

    const newLicense = {
      licenseKey, // 56 characters long
      keyLength: licenseKey.length,
      courseId,
      courseTitle: course.title,
      customerName: finalCustomerName,
      customerEmail: customerEmail || '',
      ipLockMode, // 'first_login' or 'strict'
      allowedIpv4: ipLockMode === 'strict' ? (allowedIpv4 || '').trim() : null,
      allowedIpv6: ipLockMode === 'strict' ? (allowedIpv6 || '').trim() : null,
      boundIpv4: null,
      boundIpv6: null,
      boundHwid: null,
      status: 'active',
      createdAt: new Date().toISOString(),
      activatedAt: null,
      lastAccessAt: null
    };

    db.saveLicense(newLicense);

    db.addLog({
      action: 'license_generated',
      status: 'granted',
      licenseKey,
      studentName: customerName,
      courseId,
      message: `Generated 56-character license for ${customerName} (IP Mode: ${ipLockMode}).`
    });

    res.json({ success: true, license: newLicense });
  },

  // List all licenses
  listLicenses(req, res) {
    const licenses = db.getLicenses();
    res.json({ success: true, licenses });
  },

  // Revoke a license
  revokeLicense(req, res) {
    const license = db.revokeLicense(req.params.licenseKey);
    if (!license) {
      return res.status(404).json({ error: 'License not found.' });
    }

    db.addLog({
      action: 'license_revoked',
      status: 'granted',
      licenseKey: license.licenseKey,
      studentName: license.customerName,
      message: `License ${license.licenseKey} revoked by administrator.`
    });

    res.json({ success: true, license });
  },

  // Reset Hardware ID / IP lock for a customer
  resetDevice(req, res) {
    const license = db.resetLicenseDevice(req.params.licenseKey);
    if (!license) {
      return res.status(404).json({ error: 'License not found.' });
    }

    license.boundIpv4 = null;
    license.boundIpv6 = null;
    license.boundHwid = null;
    db.saveLicense(license);

    db.addLog({
      action: 'device_reset',
      status: 'granted',
      licenseKey: license.licenseKey,
      studentName: license.customerName,
      message: `Reset device HWID and IPv4/IPv6 binding for ${license.customerName}.`
    });

    res.json({ success: true, license });
  }
};
