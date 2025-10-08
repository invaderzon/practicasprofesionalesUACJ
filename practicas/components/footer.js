export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        {/* Columna izquierda */}
        <div className="footer-left">
          <div className="footer-brand">
            <img src="/img/UACJ-firma.png" alt="UACJ" className="logo-uacj" />
          </div>

          <div className="footer-socials">
            <a href="#"><i className="fab fa-facebook-f"></i></a>
            <a href="#"><i className="fab fa-instagram"></i></a>
            <a href="#"><i className="fab fa-youtube"></i></a>
          </div>

          <img
            src="/img/logo-vinculacion.png"
            alt="Subdirección de Vinculación"
            className="logo-vinculacion"
          />
        </div>

        {/* Columnas de enlaces */}
        <div className="footer-links">
          <div>
            <h4>Acerca de UACJ</h4>
            <ul>
              <li><a href="#">Bienvenida</a></li>
              <li><a href="#">Misión/Visión</a></li>
              <li><a href="#">Directorio</a></li>
              <li><a href="#">Normatividad</a></li>
              <li><a href="#">Modelo Educativo Visión 2040</a></li>
              <li><a href="#">Planeación Institucional</a></li>
              <li><a href="#">Sistema de Gestión de la Calidad</a></li>
              <li><a href="#">Servicios Académicos</a></li>
            </ul>
          </div>

          <div>
            <h4>Enlaces de Interés</h4>
            <ul>
              <li><a href="#">Bibliotecas</a></li>
              <li><a href="#">Acreditación</a></li>
              <li><a href="#">Transparencia</a></li>
              <li><a href="#">Comprobante Fiscal</a></li>
              <li><a href="#">Consorcio Universidades</a></li>
              <li><a href="#">Aviso de Privacidad</a></li>
              <li><a href="#">Escuelas Incorporadas</a></li>
              <li><a href="#">Igualdad de Género</a></li>
              <li><a href="#">Clima y calidad del aire</a></li>
            </ul>
          </div>

          <div>
            <h4>Medios</h4>
            <ul>
              <li><a href="#">Sala de prensa</a></li>
              <li><a href="#">UACJ Radio</a></li>
              <li><a href="#">UACJ TV</a></li>
              <li><a href="#">Boletín Universitario</a></li>
              <li><a href="#">Agenda de actividades</a></li>
              <li><a href="#">Gaceta</a></li>
            </ul>
          </div>

          <div>
            <h4>Servicios Comunidad Universitaria</h4>
            <ul>
              <li><a href="#">Unidad de Género</a></li>
              <li><a href="#">Defensoría Universitaria</a></li>
              <li><a href="#">CAST</a></li>
              <li><a href="#">Restablecer contraseña</a></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Franja inferior */}
      <div className="footer-bottom">
        <p>
          Av. Plutarco Elías Calles #1210 Fovissste Chamizal Ciudad Juárez, Chih., 
          Méx. C.P. 32310 Tel.+52 (656) 688 2100
        </p>
      </div>
    </footer>
  );
}
