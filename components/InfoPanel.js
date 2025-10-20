import { useState } from "react";

export default function InfoPanel({ card }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  if (!card) return null;

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 300); 
  };

  return (
    <div>
      {/* Card */}
      <div
        className="card"
        style={{ backgroundImage: `url(${card.image})` }}
        onClick={() => setOpen(true)}
      >
        <div className="card-overlay">
          <h3>{card.title}</h3>
        </div>
      </div>

      {/* Panel fullscreen */}
      {open && (
        <div
          className={`info-panel-fullscreen ${
            closing ? "info-panel-exit" : ""
          }`}
        >
          {/* Botón cerrar */}
          <button onClick={handleClose} className="info-close-btn">
            ✕
          </button>

          {/* Contenido dinámico */}
          <div className="info-content">
            <h2>{card.title}</h2>
            <img src={card.image} alt={card.title} />
            <p>{card.description}</p>
          </div>
        </div>
      )}
    </div>
  );
}
