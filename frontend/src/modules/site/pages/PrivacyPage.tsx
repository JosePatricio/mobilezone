import { SiteLayout } from '../components/SiteLayout';
import { SITE_CONTACT_EMAIL } from '../paths';

const UPDATED = '14 de octubre de 2026';

/** Public privacy policy (no login). */
export function PrivacyPage() {
  return (
    <SiteLayout>
      <article className="card card-body site-legal">
        <h1>Política de privacidad</h1>
        <p className="muted">Última actualización: {UPDATED}</p>

        <p>
          Esta política explica qué datos trata MobileZone (pixcell.net), para qué los usa y qué derechos tiene usted
          sobre ellos.
        </p>

        <h2>Datos que recopilamos</h2>
        <ul>
          <li>
            <strong>Usuarios del sistema:</strong> nombre, correo electrónico, foto de perfil y la contraseña, que se
            guarda cifrada.
          </li>
          <li>
            <strong>Clientes:</strong> nombre, identificación, teléfono, correo y dirección, registrados al realizar
            una venta u orden de trabajo.
          </li>
          <li>
            <strong>Órdenes de trabajo:</strong> datos del equipo, fotos del equipo, observaciones y, si el cliente lo
            entrega, el patrón o clave de desbloqueo necesario para la reparación.
          </li>
          <li>
            <strong>Repuestos de afiliados:</strong> los datos e imágenes que cada afiliado publica, y un conteo
            anónimo de visitas al catálogo.
          </li>
        </ul>

        <h2>Para qué usamos los datos</h2>
        <ul>
          <li>Registrar ventas, emitir comprobantes y gestionar el inventario.</li>
          <li>Gestionar reparaciones e informar al cliente el estado de su orden (por ejemplo, por WhatsApp).</li>
          <li>Enviar comunicaciones comerciales a clientes, que pueden pedir no recibirlas en cualquier momento.</li>
          <li>Proteger el acceso al sistema y mantener copias de seguridad.</li>
        </ul>
        <p>No vendemos ni alquilamos datos personales a terceros.</p>

        <h2>Copias de seguridad y Google Drive</h2>
        <p>
          Las copias de seguridad de la base de datos y de las imágenes se guardan en una cuenta de Google Drive del
          negocio. El acceso usa el permiso <code>drive.file</code>, que solo permite ver y administrar los archivos
          creados por la propia aplicación: no se leen ni se modifican otros archivos de la cuenta. Las copias se
          eliminan automáticamente después de 14 días. El uso de la información recibida de las APIs de Google cumple
          la{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Política de datos de usuario de los servicios de API de Google
          </a>
          , incluidos los requisitos de uso limitado.
        </p>

        <h2>Cookies y almacenamiento local</h2>
        <p>
          No usamos cookies de publicidad ni de seguimiento. El navegador guarda únicamente la sesión del usuario que
          ingresa al sistema.
        </p>

        <h2>Conservación y seguridad</h2>
        <p>
          Los datos se guardan en servidores protegidos, con acceso restringido según el rol de cada usuario, y se
          conservan mientras sean necesarios para la relación comercial o lo exija la ley.
        </p>

        <h2>Sus derechos</h2>
        <p>
          Puede solicitar el acceso, la corrección o la eliminación de sus datos, u oponerse a su uso, escribiendo a{' '}
          <a href={`mailto:${SITE_CONTACT_EMAIL}`}>{SITE_CONTACT_EMAIL}</a>. Responderemos en un plazo razonable.
        </p>

        <h2>Cambios en esta política</h2>
        <p>Si cambiamos esta política, publicaremos la nueva versión en esta página con su fecha de actualización.</p>
      </article>
    </SiteLayout>
  );
}
