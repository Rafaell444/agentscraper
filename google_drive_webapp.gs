/**
 * Google Apps Script receiver for properties.xlsx.
 *
 * Run setupUploadToken() once, copy the token from the execution log, enable
 * the advanced Drive service, then deploy this project as a web app that
 * executes as you and allows anonymous access. The random token authenticates
 * uploads from the private GitHub Actions repository.
 */

const WORKBOOK_NAME = "properties.xlsx";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function setupUploadToken() {
  const token = Utilities.getUuid().replace(/-/g, "") +
    Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty("UPLOAD_TOKEN", token);
  console.log("GOOGLE_DRIVE_UPLOAD_TOKEN=" + token);
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonResponse({ ok: true, service: "agentscraper-drive" });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const payload = JSON.parse(e.postData.contents || "{}");
    const expected = PropertiesService.getScriptProperties()
      .getProperty("UPLOAD_TOKEN");
    if (!expected || payload.token !== expected) {
      return jsonResponse({ ok: false, error: "unauthorized" });
    }
    if (payload.filename !== WORKBOOK_NAME || !payload.content_base64) {
      return jsonResponse({ ok: false, error: "invalid upload" });
    }

    const bytes = Utilities.base64Decode(payload.content_base64);
    const blob = Utilities.newBlob(bytes, XLSX_MIME, WORKBOOK_NAME);
    const properties = PropertiesService.getScriptProperties();
    let fileId = properties.getProperty("WORKBOOK_FILE_ID");

    if (fileId) {
      try {
        Drive.Files.update(
          { name: WORKBOOK_NAME, mimeType: XLSX_MIME },
          fileId,
          blob,
          { fields: "id,name" }
        );
      } catch (error) {
        // Recreate the file if it was manually deleted from Drive.
        fileId = null;
      }
    }

    if (!fileId) {
      const file = Drive.Files.create(
        { name: WORKBOOK_NAME, mimeType: XLSX_MIME },
        blob,
        { fields: "id,name" }
      );
      fileId = file.id;
      properties.setProperty("WORKBOOK_FILE_ID", fileId);
    }

    return jsonResponse({ ok: true, file_id: fileId });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error.message || error) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}
