import { useState } from 'react';
import { useRouter } from 'next/router';
import Navbar from '../components/navbar';
import Footer from '../components/footer';
import InfoPanel from '@/components/InfoPanel';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

export default function PracticasInfoPage() {


    return (
        <>
            <Navbar />
            <div className="contenedorBanner" aria-roledescription="Banner">
                <div className='imagen-banner' style={{ backgroundImage: "url('/img/banner-practicas.jpg')" }}></div>
                <div className="card-overlay">
                    <div className='texto-banner'>
                        <h1>Prepárate para tus prácticas profesionales.</h1>
                        <h3>Todo lo que necesitas saber antes de realizar tu proceso de búsqueda de nuevas oportunidades.</h3>
                    </div>

                </div>

            </div>
            <div className='Contenedor'>


                <section className='two-columns'>

                    <div className='info-card-one'>
                        <div className='info-img'>
                            <div className='imagen-card-info' style={{ backgroundImage: "url('/img/card1.jpg')" }}></div>
                        </div>
                        <div className='texto-info'>
                            <h2>Requisitos para la realización de Prácticas profesionales</h2>
                            <ul>
                                <li>La existencia de un convenio específico de prácticas profesionales.</li>
                                <li>Cumplir con los requisitos que le solicita su programa educativo.</li>
                                <li>Vacante capturada en el portal de prácticas profesionales por parte del sector externo.</li>
                                <li>Ser estudiante inscrito.</li>
                                <li>No rebasar 18 meses de práctica, en periodos continuos o discontinuo o en diversas sedes de práctica.</li>

                            </ul>


                        </div>

                    </div>

                    <div className='info-card-two'>

                        <div className='texto-info'>
                            <h2>Objetivos de las prácticas profesionales</h2>
                            <ul>
                                <li>Contribuir con la formación integral de las y los estudiantes para el desarrollo de competencias, habilidades, aptitudes y experiencia realizando actividades profesionales en el sector público, privado y social, nacionales e internacionales.</li>
                                <li>Fortalecer la formación práctica de las y los estudiantes, ampliando su capacidad profesional.</li>
                                <li>Consolidar la formación académica de las y los estudiantes, mediante la vinculación con los sectores público, privado y social.</li>

                            </ul>

                        </div>
                        <div className='info-img'>
                            <div className='imagen-card-info' style={{ backgroundImage: "url('/img/card2.jpg')" }}></div>

                        </div>
                    </div>

                </section>

                <div className="section-container">
                    <h2 className="section-title">Beneficios de las Prácicas profesionales</h2>
                    <section className='cards-practicas'>
                        <div className='card-practicas'>
                            <div className="card-info">
                                <h3>Ventaja Competitiva</h3>
                                <p>La experiencia práctica en tu currículum te hace un candidato más atractivo y te brinda un aventaja significativa al buscar empleo después de graduarte.</p>
                            </div>
                        </div>

                        <div className='card-practicas'>
                            <div className="card-info">
                                <h3>Transición laboral</h3>
                                <p>Las prácticas profesionales te ayudan a entender la cultura laboral y a prepararte para la transición de la vida académica al mundo profesional.</p>
                            </div>
                        </div>

                        <div className='card-practicas'>
                            <div className="card-info">
                                <h3>Aplicación de conocimientos</h3>
                                <p>Las prácticas profesionales te permiten consolidar tus conocimientos y prepararte para los desafíos del mundo laboral.</p>
                            </div>
                        </div>
                    </section>
                </div>

                <div className='section-container'>
                    <div className='llamado'>
                        <div className='llamado-texto'>
                            <h2>Conecta con el mundo laboral</h2>
                            <p>No esperes más para transformar tu aprendizaje en experiencia real y asegurar tu camino al éxito. </p>
                        </div>
                        <Link href={"/login"}>
                            <button className='portal-estudiante'>Ingresar al portal de estudiantes</button>
                        </Link>

                    </div>
                </div>







            </div>






            <Footer />
        </>
    );
}
