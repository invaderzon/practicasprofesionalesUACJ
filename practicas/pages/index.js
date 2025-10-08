import Navbar from '../components/navbar';
import Footer from '../components/footer';
import Slider from "../components/slider";
import InfoPanel from '@/components/InfoPanel';
import Link from 'next/link';

const infoCards = [
  {
    id: 1,
    title: "Procedimiento para registrar prácticas profesionales.",
    image: "/img/ER_01.jpg",
    description: "Conoce los pasos a seguir para liberar las prácticas profesionales, los requisitos obligatorios a cumplir y los documentos que a entregar en línea o de manera presencial.  "
  },
  {
    id: 2,
    title: "Prácticas Profesionales con empresas no vinculadas a la UACJ.",
    image: "/img/ER_02.jpg",
    description: "Este procedimiento comienza con la solicitud de convenio para iniciar el trámite. Posteriormente se elabora una propuesta de convenio, la cual es sometida a una revisión jurídica por ambas partes. Una vez aprobada por ambas instancias se realizan las firmas correspondientes. Una vez formalizado, se notificará a la empresa para que pase a recoger su ejemplar del convenio."
  },
  {
    id: 3,
    title: "Compensaciones",
    image: "/img/ER_03.jpg",
    description: "Algunas empresas ofrecen remuneración económica a los estudiantes que estén realizando sus prácticas profesionales. Esta compensación depende de cada empresa y varía entre las vacantes que ofertan. Adicionalmente, la empresa puede ofrecer un puesto de trabajo a los estudiantes que concretaron sus practicas profesionales en su mando, lo cual permite que los estudiantes tengan un puesto de trabajo inmediatamente después de graduarse."
  },
  {
    id: 4,
    title: "Cierre por registro.",
    image: "/img/ER_04.jpg",
    description: "Es necesario entregar los documentos requeridos en las oficinas de la Subdirección de Vinculación o bien escanear los documentos totalmente legibles y enviarlos al correo de practicasprofesionales@uacj.mx. Posteriormente se debe responder encuesta de desempeño de la o el estudiante. Finalmente, el supervisor directo, deberá llenar y firmar el formato y sello de la empresa."
  },
  {
    id: 5,
    title: "Prácticas profesionales por reconocimiento.",
    image: "/img/ER_05.jpg",
    description: "La UACJ, con el objetivo de facilitar que los estudiantes que realizan prácticas profesionales reciban una compensación económica por parte de las diferentes sedes de prácticas profesionales, puede ser intermediaria (no obligatoriamente) entre la sede de la práctica y el estudiante. Es importante señalar que este apoyo, por parte de la universidad se gestiona de manera mensual."
  },
];



export default function Home() {
  return (
    <>
      <Navbar />

      {/* Header / Slider */}
      <header>
        <Slider />
      </header>

      <div className='Contenedor'>
        {/* Panel de acceso */}
        <div className="section-container">
          <h2 className="section-title">Panel de Acceso</h2>

          <section className="cards-section">
            {/* Estudiantes → /login */}
            <Link href="/login" className="card" style={{ backgroundImage: "url('/img/Estudiantes.jpg')" }}>
              <div className="card-overlay">
                <h3>Portal de Estudiante</h3>
                <p>Administre sus grupos y acceda al registro de proyectos para agregar o editar información de las vacantes.</p>
              </div>
            </Link>

            {/* Profesores → /login */}
            <Link href="/login" className="card" style={{ backgroundImage: "url('/img/Profesores.jpg')" }}>
              <div className="card-overlay">
                <h3>Portal de Profesores</h3>
                <p>Acceda a la lista de proyectos disponibles y envíe su solicitud de prácticas profesionales.</p>
              </div>
            </Link>

            {/* Reglamento → externo en nueva pestaña */}
            <a
              href="https://urlreglamentoquetodavianotengo"
              target="_blank"
              rel="noopener noreferrer"
              className="card"
              style={{ backgroundImage: "url('/img/Reglamento.jpg')" }}
            >
              <div className="card-overlay">
                <h3>Reglamento</h3>
                <p>Consulta las normas y lineamientos que regulan el proceso de prácticas profesionales.</p>
              </div>
            </a>
          </section>
        </div>

        {/* Datos duros */}
        <section className="datos-duros">
          <div className="datos-duros">
            <div className="dato">
              <h3>+500</h3>
              <p>Empresas registradas</p>
              <span>Colaboradores que confían en la formación de los alumnos en la UACJ.</span>
            </div>

            <div className="dato">
              <h3>+830</h3>
              <p>Estudiantes activos</p>
              <span>Con acceso a la lista de vacantes para su licenciatura.</span>
            </div>

            <div className="dato">
              <h3>+10</h3>
              <p>Convenios vigentes</p>
              <span>Acuerdos con empresas y organismos.</span>
            </div>

            <div className="dato">
              <h3>+1500</h3>
              <p>Vacantes publicadas</p>
              <span>Conectando estudiantes con diversas oportunidades laborales.</span>
            </div>
          </div>
        </section>

        {/* Año */}
        <div className="Año">
          <h2>2025.2</h2>
        </div>

        {/* Más información */}
        <div className="section-container-fondo-imagen">
          <div className="overlay">
            <h2>¿Qué son las prácticas profesionales?</h2>
            <p>
              Son una estrategia institucional que se adapta a la naturaleza y necesidades de los programas educativos,
              propiciando en las y los estudiantes diversas actividades de aprendizaje y experiencia en el ámbito profesional
              dentro de su formación.
            </p>
            <Link href={"/practicas"}>
              <button className="btn-leer-mas">Leer más</button>
            </Link>
            
          </div>
        </div>

        {/* Panel de empresas */}

        <div className="contenedor-cards-empresas">
          <h2 className="section-title-fondo">Empresas con vinculación a la UACJ</h2>
          <section className="cards-section empresas">
            <div className="card logo-card" style={{ backgroundImage: "url('/img/logo-arteenelparque.png')" }}></div>
            <div className="card logo-card" style={{ backgroundImage: "url('/img/logo-comex.png')" }}></div>
            <div className="card logo-card" style={{ backgroundImage: "url('/img/logo-conagua.png')" }}></div>
            <div className="card logo-card" style={{ backgroundImage: "url('/img/logo-hivision.png')" }}></div>
            <div className="card logo-card" style={{ backgroundImage: "url('/img/logo-kia.png')" }}></div>
            <div className="card logo-card" style={{ backgroundImage: "url('/img/logo-semarnat.png')" }}></div>
            <div className="card logo-card" style={{ backgroundImage: "url('/img/logo-tecma.png')" }}></div>
            <div className="card logo-card" style={{ backgroundImage: "url('/img/logo-totalgas.png')" }}></div>
            <div className="card logo-card" style={{ backgroundImage: "url('/img/logo-wistron.png')" }}></div>
            <div className="card logo-card" style={{ backgroundImage: "url('/img/logo-rodadora.png')" }}></div>
          </section>
        </div>


        {/* Información relacionada */}
        <div className="section-container">
          <h2 className="section-title">Información relacionada.</h2>
            <section className="cards-section">
              {infoCards.map((card) => (
                <InfoPanel key={card.id} card={card} />
              ))}
            </section>
        </div>

      </div>

      <Footer />
    </>
  );
}
