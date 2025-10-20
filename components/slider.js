import { useState, useEffect } from "react";

export default function Slider() {
  const slides = [
    { id: 1, image: "/img/P_01.jpg" },
    { id: 2, image: "/img/P_02.jpg" },
    { id: 3, image: "/img/P_03.jpg" },
  ];

  const [current, setCurrent] = useState(0);
  const total = slides.length;

  // Autoplay cada 5s
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % total);
    }, 5000);
    return () => clearInterval(interval);
  }, [total]);

  // porcentaje por slide relativo al ancho del track (.slide)
  const stepPercent = 100 / total; // ej: con 3 slides => 33.333...%

  return (
    <div className="contenedorSlider" aria-roledescription="carousel">
      <div
        className="slide"
        style={{
          width: `${total * 100}%`, // track ancho total (ej: 300%)
          transform: `translateX(-${current * stepPercent}%)`, // mueve por "pasos" relativos al track
        }}
      >
        {slides.map((slide) => (
          <div
            key={slide.id}
            className="item-slide"
            style={{ flex: `0 0 ${stepPercent}%` }} // cada item ocupa (100/total)% del track => 1 viewport
          >
            <img src={slide.image} alt={`slide-${slide.id}`} loading="lazy" />
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="pagination" role="tablist" aria-label="Paginación del slider">
        {slides.map((_, index) => (
          <button
            key={index}
            className={`pagination-item ${current === index ? "active" : ""}`}
            onClick={() => setCurrent(index)}
            aria-label={`Ir al slide ${index + 1}`}
            aria-selected={current === index}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
