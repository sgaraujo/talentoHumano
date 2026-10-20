// Correo de "Comunicado Oficial": lo usan el envío inmediato (sendCommunicationEmail,
// Correos y Boletines) y los envíos programados, para que ambos se vean igual.

export interface CommunicationEmailRecipient {
  email: string;
  name: string;
  link: string;
  quizLink?: string;
  ctaTrackingUrl?: string;
}

export interface CommunicationEmailInput {
  communicationId: string;
  title: string;
  body: string;
  recipients: CommunicationEmailRecipient[];
  attachments?: Array<{ name: string; url: string; link?: string }>;
  ctaButton?: { text: string; url: string } | null;
  questionnaireName?: string | null;
}

/** Envía un correo por destinatario; los fallos individuales no detienen el resto. */
export async function deliverCommunicationEmails(
  input: CommunicationEmailInput,
  graphToken: string,
  sender: string,
): Promise<{ sent: number; errors: Array<{ email: string; error: string }> }> {
  const { communicationId, title, body, recipients, attachments = [], ctaButton = null, questionnaireName = null } = input;
  const year       = new Date().getFullYear();
  const dateStr    = new Date().toLocaleDateString("es-CO", {
    day: "2-digit", month: "long", year: "numeric",
  });

  // Construir bloque de adjuntos
  const isImage = (name: string) => /\.(jpe?g|png|gif|webp|svg)$/i.test(name);

  const attList = attachments;

  const attachmentRows = attList.map(att => isImage(att.name) ? `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;text-align:center">
            <a href="${att.link || att.url}" target="_blank" style="display:block">
              <img src="${att.url}" alt="${att.name}"
                   width="480" height="auto"
                   style="max-width:100%;height:auto;border-radius:8px;
                          border:1px solid #e5e7eb;display:block;margin:0 auto"
                   border="0" />
            </a>
          </td>
        </tr>` : `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="padding:0">
                <span style="font-size:14px;margin-right:8px">📎</span>
                <span style="font-size:13px;color:#374151">${att.name}</span>
              </td>
              <td style="text-align:right">
                <a href="${att.url}" target="_blank"
                   style="background:#f9fafb;border:1px solid #e5e7eb;color:#374151;
                          text-decoration:none;padding:6px 14px;border-radius:6px;
                          font-size:12px;font-weight:600;display:inline-block">Descargar</a>
              </td>
            </tr></table>
          </td>
        </tr>`
  ).join("");

  const attachmentsSection = attList.length > 0 ? `
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;
                    padding:4px 16px;margin:24px 0">
        <tr>
          <td style="padding:12px 0 4px">
            <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;
                      font-weight:700;letter-spacing:1px">Archivos adjuntos</p>
          </td>
        </tr>
        ${attachmentRows}
      </table>
    ` : "";

  // Formatear el body (saltos de línea → párrafos)
  const bodyHtml = String(body)
    .split("\n")
    .filter(l => l.trim())
    .map(l => `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.7">${l}</p>`)
    .join("");

  const errors: Array<{ email: string; error: string }> = [];
  let sent = 0;

  for (const recipient of recipients) {
    try {
      const quizLink: string | null = recipient.quizLink || null;
      const ctaUrl: string | null = recipient.ctaTrackingUrl || (ctaButton ? ctaButton.url : null);

      const html = `
<!DOCTYPE html>
<html lang="es" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light only; supported-color-schemes: light; }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    @media (prefers-color-scheme: dark) {
      body, .body-wrap { background-color: #f3f4f6 !important; }
      .header-bg { background: #004d22 !important; background-color: #004d22 !important; }
      .card-bg { background-color: #ffffff !important; }
      .greeting-bg { background-color: #f0fdf4 !important; }
      .footer-bg { background-color: #1f2937 !important; }
      h1, h2, p, span, td { color: inherit !important; }
    }
  </style>
</head>
<body class="body-wrap" style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif" bgcolor="#f3f4f6">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px" bgcolor="#f3f4f6">
    <tr>
      <td align="center" bgcolor="#f3f4f6">
        <table width="100%" style="max-width:580px" cellpadding="0" cellspacing="0">

          <!-- HEADER -->
          <tr>
            <td class="header-bg" bgcolor="#004d22"
                style="background:#004d22;padding:36px 32px 28px;border-radius:16px 16px 0 0;text-align:center">
              <h1 style="color:#ffffff !important;margin:0 0 4px;font-size:28px;letter-spacing:4px;font-weight:800">
                INTE<span style="color:#7BCB6A !important">E</span>GRADOS
              </h1>
              <p style="color:#a7f3d0 !important;margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase">
                Gestión de Talento Humano
              </p>
              <div style="width:48px;height:3px;background:#7BCB6A;border-radius:2px;margin:20px auto 0"></div>
              <p style="margin:16px 0 0;font-size:11px;color:#a7f3d0;letter-spacing:2px;text-transform:uppercase;font-weight:600">
                📣 Comunicado Oficial
              </p>
              <h2 style="color:#ffffff !important;margin:8px 0 0;font-size:22px;font-weight:700;line-height:1.3">
                ${title}
              </h2>
              <p style="color:#a7f3d0 !important;margin:10px 0 0;font-size:12px">${dateStr}</p>
            </td>
          </tr>

          <!-- MAIN CARD -->
          <tr>
            <td class="card-bg" bgcolor="#ffffff"
                style="background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;
                       padding:40px 32px;text-align:center">

              <!-- Saludo -->
              <p style="margin:0 0 6px;font-size:16px;color:#374151 !important;text-align:left">
                Hola <strong>${recipient.name}</strong>,
              </p>
              <div style="text-align:left;margin:0 0 24px">
                ${bodyHtml}
              </div>

              <!-- BOTÓN PRINCIPAL — Ver comunicado -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${recipient.link}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;background:#008C3C;color:#ffffff !important;
                              text-decoration:none;padding:18px 48px;border-radius:12px;
                              font-weight:800;font-size:17px;letter-spacing:0.5px;
                              box-shadow:0 4px 14px rgba(0,140,60,0.35);
                              border:0;mso-padding-alt:0">
                      Ver comunicado &nbsp;&#8594;
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:14px">
                    <p style="margin:0;font-size:11px;color:#9ca3af !important">
                      Este enlace es personal. No lo compartas.
                    </p>
                  </td>
                </tr>
              </table>

              ${ctaButton && ctaUrl ? `
              <!-- BOTÓN CTA ADICIONAL -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px">
                <tr>
                  <td align="center">
                    <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;background:#7c3aed;color:#ffffff !important;
                              text-decoration:none;padding:13px 32px;border-radius:10px;
                              font-weight:700;font-size:14px;letter-spacing:0.3px;border:0">
                      ${ctaButton.text} &#8594;
                    </a>
                  </td>
                </tr>
              </table>` : ""}

              ${quizLink ? `
              <!-- SEPARADOR -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0">
                <tr>
                  <td style="border-top:1px solid #f3f4f6;padding-top:24px">

                    <!-- Etiqueta encuesta -->
                    <p style="margin:0 0 4px;font-size:11px;color:#92400e !important;
                               font-weight:700;letter-spacing:1px;text-transform:uppercase;text-align:center">
                      📋 Cuestionario adjunto
                    </p>
                    <p style="margin:0 0 16px;font-size:13px;color:#78350f !important;text-align:center">
                      <strong>${questionnaireName || "Encuesta"}</strong> — tu opinión es importante
                    </p>

                    <!-- BOTÓN ENCUESTA -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="${quizLink}" target="_blank" rel="noopener noreferrer"
                             style="display:inline-block;background:#d97706;color:#ffffff !important;
                                    text-decoration:none;padding:14px 36px;border-radius:10px;
                                    font-weight:700;font-size:15px;letter-spacing:0.3px;
                                    box-shadow:0 4px 12px rgba(217,119,6,0.30);border:0">
                            Responder encuesta &nbsp;&#8594;
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding-top:10px">
                          <p style="margin:0;font-size:11px;color:#9ca3af !important">
                            Enlace personal e intransferible.
                          </p>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>` : ""}

              ${attachmentsSection}

            </td>
          </tr>

          <!-- INFO BAR -->
          <tr>
            <td bgcolor="#f0fdf4"
                style="background:#f0fdf4;border:1px solid #e5e7eb;border-top:none;padding:14px 32px">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="font-size:12px;color:#166534">
                  ✅ Mensaje oficial enviado por Inteegrados.
                </td>
                <td style="text-align:right;font-size:12px;color:#6b7280;white-space:nowrap">
                  ID: ${String(communicationId).slice(0, 8)}
                </td>
              </tr></table>
            </td>
          </tr>

          <!-- FIRMA -->
          <tr>
            <td bgcolor="#ffffff"
                style="background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;
                       padding:16px 32px;text-align:center">
              <img src="https://nelyoda.web.app/firma-nelly.jpg"
                   alt="Nelly Pinto - Gerente de Talento Humano"
                   style="max-width:480px;width:100%;display:block;margin:0 auto" />
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td class="footer-bg" bgcolor="#1f2937"
                style="background:#1f2937;border-radius:0 0 16px 16px;padding:24px 32px;text-align:center">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:2px;color:#ffffff !important">
                INTE<span style="color:#7BCB6A !important">E</span>GRADOS
              </p>
              <p style="margin:0 0 12px;font-size:11px;color:#9ca3af !important">
                Sistema de Gestión de Talento Humano
              </p>
              <p style="margin:0;font-size:10px;color:#6b7280 !important;line-height:1.6">
                Correo confidencial y exclusivo para ${recipient.name}.<br/>
                No compartas estos enlaces. &copy; ${year} Inteegrados &middot; Todos los derechos reservados.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

      const sendUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;
      const graphRes = await fetch(sendUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${graphToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: `[Comunicado] ${title}`,
            body: { contentType: "HTML", content: html },
            toRecipients: [{ emailAddress: { address: recipient.email } }],
          },
          saveToSentItems: true,
        }),
      });

      if (!graphRes.ok) {
        const errText = await graphRes.text();
        errors.push({ email: recipient.email, error: errText });
      } else {
        sent++;
      }
    } catch (err: any) {
      errors.push({ email: recipient.email, error: err?.message || "unknown" });
    }
  }

  return { sent, errors };
}
