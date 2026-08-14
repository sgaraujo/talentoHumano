# Arquitectura de Firestore

Este documento describe la estructura que existe actualmente. Los nombres del
catálogo `src/config/firestoreCollections.ts` son rutas reales: no deben
renombrarse sin una migración.

## Dominios y colecciones

| Dominio | Colecciones | Responsabilidad |
| --- | --- | --- |
| Identidad | `identity/data/*` | Perfil, acceso y verificación |
| Organización | `organization/data/*` | Empresas, proyectos y pertenencias |
| Formularios | `questionnaires/data/*` | Definición, asignación y respuestas |
| Comunicaciones | `communications/data/*` | Envíos, destinatarios, boletines y trazabilidad |
| Contabilidad | `accounting/data/*` | Obligaciones, actividad, alertas e integración tributaria |
| Talento humano | `human_resources/data/*` | Ingresos, retiros y analítica |
| WhatsApp | `whatsapp/data/*` | Números, conversaciones y campañas |

## Jerarquías

```text
accounting/data
  tax_obligations/{obligationId}
    history/{historyId}
  tax_daily_activity/{activityId}
  tax_alerts/{alertId}
  tax_calendar_events/{eventId}
  company_tax_settings/{companyId}

organization/data
  companies/{companyId}
  projects/{projectId}
  company_memberships/{membershipId}
  project_memberships/{membershipId}

questionnaires/data
  definitions/{questionnaireId}
  assignments/{assignmentId}
  responses/{responseId}

communications/data
  messages/{messageId}
  recipients/{recipientId}
  bulletins/{bulletinId}/views/{viewId}
  accounting_messages/{messageId}

human_resources/data
  movements/{movementId}
  employees/{employeeId}
    employments/{employmentId}
      private/payroll
    private/banking
    private/social_security
  contractors/{contractorId}
  apprentices/{apprenticeId}
  incapacities/{caseId}
  correspondence/{recordId}
  import_runs/{importId}

identity/data
  users/{userId}
  platform_roles/{email}
  allowed_emails/{email}
  email_verifications/{email}

whatsapp/data
  numbers/{numberId}/templates/{templateId}
  numbers/{numberId}/conversations/{conversationId}
    messages/{messageId}
    processed/{providerMessageId}
  campaigns/{campaignId}/recipients/{recipientId}
  message_index/{providerMessageId}
```

## Fuentes oficiales

- `identity/data/users`: perfil de la persona. Los arrays `companyIds` y `projectIds` son
  índices derivados y no deben considerarse la fuente principal.
- `organization/data/company_memberships`: pertenencia de usuarios a empresas.
- `organization/data/project_memberships`: pertenencia de usuarios a proyectos.
- `organization/data/companies` y `organization/data/projects`: datos maestros.
- `accounting/data/tax_obligations`: estado actual de una obligación tributaria.
- `accounting/data/tax_obligations/{id}/history`: historial de estados.
- `accounting/data/tax_daily_activity`: actividad usada para el resumen de las 5 p. m.
- `accounting/data/tax_alerts`: evidencia inmutable de alertas enviadas.
- `accounting/data/tax_calendar_events`: vínculo con calendarios externos.
- `accounting/data/company_tax_settings`: impuestos excluidos por empresa; la
  empresa se referencia por ID y no almacena configuración contable.
- `questionnaires/data/assignments`: estado de una asignación de cuestionario.
- `questionnaires/data/responses`: contenido enviado por el usuario.
- `human_resources/data/employees`: expediente laboral operativo, separado del
  usuario que inicia sesión.
- `human_resources/data/employees/{id}/employments`: relaciones laborales de la
  persona. Una persona puede tener varias empresas o proyectos activos al mismo
  tiempo; la cédula identifica a la persona, no a una única vinculación.
- `human_resources/data/employees/{id}/private/*`: salario, banco y seguridad
  social; acceso exclusivo para Administración y Talento Humano.
- `human_resources/data/import_runs`: auditoría de diagnósticos y aplicaciones
  de archivos maestros de Talento Humano.

## Convenciones para código nuevo

1. Usar `FIRESTORE_COLLECTIONS`; no escribir nombres de colecciones directamente.
2. Usar `serverTimestamp()` para `createdAt` y `updatedAt`.
3. Usar `YYYY-MM-DD` únicamente para fechas civiles sin hora.
4. Guardar referencias mediante identificadores (`companyId`, `projectId`,
   `userId`). Los nombres duplicados son solo datos de presentación.
5. Los logs son inmutables desde el cliente: se crean, pero no se editan.
6. Toda colección nueva debe añadirse a este documento, al catálogo y a las
   reglas de seguridad.

## Deuda pendiente

- Separar del perfil público los datos salariales, bancarios y de seguridad social.
- Eliminar gradualmente la duplicidad entre membresías y arrays de `users`.
- Versionar índices compuestos en `firestore.indexes.json`.
- Definir retención para logs y eventos técnicos.

## Calendario tributario

- `accounting/data/tax_obligations` contiene el estado actual de cada obligación.
- `history` conserva los cambios de estado como documentos inmutables.
- `tax_daily_activity` alimenta el resumen operativo diario.
- `tax_alerts` evita duplicar alertas y deja evidencia de los envíos.
- `tax_calendar_events` relaciona obligaciones con calendarios externos.
- `company_tax_settings` guarda la configuración tributaria por `companyId`.
- El frontend delega la persistencia en `taxCalendarService`; las vistas no
  escriben directamente en estas colecciones.

### Identidad canónica de empresa

- `organization/data/companies/{companyId}` es la fuente oficial del nombre y NIT.
- La ficha **Empresas y dotación** calcula personas, proyectos y calidad desde
  `human_resources/data/employees/{employeeId}/employments`; estos contadores no
  se duplican dentro del documento de empresa.
- Las relaciones nuevas deben usar `companyId` como vínculo principal. El campo
  `companyName` queda solo para presentación y compatibilidad. `aliases` en la
  empresa permite resolver temporalmente nombres históricos mientras termina
  la migración a identificadores.
- Cada obligación nueva guarda `companyId`, además de `company` y `nit` como
  valores desnormalizados para reportes y correos.
- La comparación usa `companyId`; NIT y nombre normalizado quedan únicamente
  como compatibilidad con documentos legacy.
- El 15 de julio de 2026 se normalizaron 172 obligaciones. La verificación sobre
  196 documentos terminó con cero diferencias.
- `src/domain/tax/taxIdentity.ts` concentra identidad de empresa, alias de
  impuestos y emparejamiento entre registros manuales y calendario automático.
- `taxCalendarService` concentra persistencia de obligaciones, historial y
  actividad diaria; las vistas no deben escribir directamente en colecciones.

## Estado final de la migración (16 de julio de 2026)

- Contabilidad, organización, cuestionarios, comunicaciones, talento humano,
  identidad y WhatsApp operan exclusivamente sobre sus rutas canónicas.
- Las colecciones raíz antiguas fueron verificadas y eliminadas de Firestore.
- Se retiraron del frontend y de las funciones las lecturas y escrituras duales.
- Las reglas deniegan por defecto las rutas no inventariadas y bloquean las
  antiguas, evitando que vuelvan a crearse desde clientes.
- Las reglas se probaron para `admin`, `contabilidad`, `financiera`,
  `talento_humano` y usuarios anónimos antes de publicarse.
- Frontend, reglas y funciones dependientes de identidad y contabilidad fueron
  desplegados y validados funcionalmente en producción.
- Los scripts temporales de migración se eliminaron una vez cerrada la fase.

### Talento humano

- `human_resources/data/movements` es la ruta canónica para ingresos, retiros y
  métricas de rotación.
- El 16 de julio de 2026 se copiaron 3.972 documentos desde `movements`,
  conservando sus identificadores; la verificación terminó sin faltantes.
- La aplicación publicada ya lee y escribe únicamente en la ruta canónica.
- Solo los roles `admin` y `talento_humano` tienen acceso a la colección nueva.
- La colección raíz `movements` fue eliminada después de la validación.

### Identidad

- `identity/data/platform_roles` es la fuente canónica usada por las reglas de
  seguridad y por las funciones actualizadas.
- `identity/data/allowed_emails` controla qué correos pueden solicitar acceso.
- `identity/data/email_verifications` almacena códigos temporales y no admite
  acceso directo desde clientes.
- El 16 de julio de 2026 se copiaron 10 roles, 19 correos autorizados y 14
  verificaciones; los tres conteos terminaron sin faltantes.
- `identity/data/users` es la ruta canónica de perfiles. El 16 de julio de 2026
  se copiaron 2.207 documentos conservando IDs y contenido; frontend y las
  funciones consumidoras fueron desplegados sobre la ruta nueva.
- Las colecciones raíz de identidad fueron eliminadas y ya no reciben escritura.
- La separación de perfil general, salario, datos bancarios y seguridad social
  sigue pendiente.

### WhatsApp

- `whatsapp/data/numbers`, `whatsapp/data/campaigns` y
  `whatsapp/data/message_index` son las rutas canónicas.
- El 16 de julio de 2026 se migraron 38 documentos contando números,
  plantillas, conversaciones, mensajes, registros procesados, campañas,
  destinatarios e índices; la verificación terminó sin faltantes.
- Frontend, webhook, envío directo, plantillas y campañas fueron desplegados
  sobre la jerarquía nueva.
- `wa_numbers`, `wa_campaigns` y `wa_message_index` fueron eliminadas después
  de probar mensajes entrantes, salientes y campañas.
