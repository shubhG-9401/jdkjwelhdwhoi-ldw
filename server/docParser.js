import AdmZip from 'adm-zip';

/**
 * Parses course document text into structured modules, lessons, video streams, and PDFs.
 * Handles structures like:
 * Course name :- Sigma 12
 * 1. welcome to sigma
 * https://www.pdffiller.com/s/k_zyV2H-p
 * 2 . Live sessions
 *    1. https://...m3u8
 * 3. telegram
 *    https://t.me/...
 * 
 * @param {string} text - Raw document text
 * @returns {{ courseName: string, modules: Array }}
 */
export function parseCourseDocumentText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  let courseName = '';
  const modules = [];
  let currentModule = null;
  let lessonCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect Course Name (e.g. "Course name :- Sigma 12" or "Course: ...")
    const courseNameMatch = line.match(/^Course\s*(?:name)?\s*[:-]+\s*(.+)$/i);
    if (courseNameMatch && !courseName) {
      courseName = courseNameMatch[1].trim();
      continue;
    }

    // Detect Module Header (e.g. "1. Welcome to Sigma 12!", "2. Live Sessions", "6. HTML (Level 1) - Part A")
    const moduleMatch = line.match(/^(\d+)\s*[\.\-:]\s*(.+)$/i);
    const containsUrl = /https?:\/\//i.test(line);

    if (moduleMatch && !containsUrl) {
      const moduleNum = moduleMatch[1];
      const moduleTitle = `${moduleNum}. ${moduleMatch[2].trim()}`;
      
      currentModule = {
        id: `mod_${moduleNum}`,
        moduleTitle,
        lessons: []
      };
      modules.push(currentModule);
      continue;
    }

    // If no module yet, create a default one
    if (!currentModule) {
      currentModule = {
        id: 'mod_1',
        moduleTitle: 'Module 1: Course Content',
        lessons: []
      };
      modules.push(currentModule);
    }

    // Check if line contains a URL (video, pdf, image, resource)
    const urlMatch = line.match(/(https?:\/\/[^\s]+)/i);
    if (urlMatch) {
      const url = urlMatch[1];
      let title = line.replace(url, '').replace(/^[\d\s.)-]+/, '').trim();
      if (!title) {
        title = `Lesson ${currentModule.lessons.length + 1}`;
      }

      let type = 'resource';
      if (url.includes('.m3u8') || url.includes('.mp4') || url.includes('.webm') || url.includes('wistia') || url.includes('vimeo')) {
        type = 'video';
      } else if (url.includes('.pdf') || url.includes('pdffiller.com')) {
        type = 'pdf';
      } else if (url.includes('ibb.co') || url.includes('.png') || url.includes('.jpg') || url.includes('.jpeg')) {
        type = 'image';
      } else if (url.includes('t.me') || url.includes('telegram')) {
        type = 'telegram';
      }

      currentModule.lessons.push({
        id: `les_${lessonCounter++}`,
        title,
        type,
        url,
        isStreamUrl: true
      });
      continue;
    }

    // Non-URL line under a module
    if (line.length > 0 && !line.match(/^[-=*_]{3,}$/)) {
      const nextLine = lines[i + 1];
      if (nextLine && nextLine.match(/https?:\/\//i)) {
        const nextUrl = nextLine.match(/(https?:\/\/[^\s]+)/i)[1];
        let type = 'video';
        if (nextUrl.includes('.pdf') || nextUrl.includes('pdffiller.com')) type = 'pdf';
        else if (nextUrl.includes('.m3u8') || nextUrl.includes('wistia')) type = 'video';
        else if (nextUrl.includes('t.me')) type = 'telegram';

        currentModule.lessons.push({
          id: `les_${lessonCounter++}`,
          title: line.replace(/^[\d\s.)-]+/, '').trim() || `Lesson ${currentModule.lessons.length + 1}`,
          type,
          url: nextUrl,
          isStreamUrl: true
        });
        i++; // skip consumed URL line
      } else {
        currentModule.lessons.push({
          id: `les_${lessonCounter++}`,
          title: line.slice(0, 40),
          type: 'doc',
          content: line
        });
      }
    }
  }

  return {
    courseName: courseName || 'Sigma Course',
    modules
  };
}

/**
 * Extracts raw text from DOCX, TXT, or MD buffer using adm-zip.
 */
export async function extractTextFromBuffer(buffer, originalFilename = '') {
  const ext = originalFilename.split('.').pop().toLowerCase();
  
  if (ext === 'docx') {
    try {
      const zip = new AdmZip(buffer);
      const xml = zip.readAsText('word/document.xml');
      if (xml) {
        return xml
          .replace(/<\/w:p>/g, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
      }
    } catch (err) {
      console.warn('adm-zip docx extraction failed, fallback to utf8 string:', err.message);
    }
  }

  return buffer.toString('utf8');
}
