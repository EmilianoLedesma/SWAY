// =============================================
// MAIN - FUNCIONES GENERALES SWAY
// Sistema principal de funcionalidades de la página
// =============================================


function authHeaders() {
  const token = localStorage.getItem('tienda_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

/**
 * Variables globales del sistema principal
 * Controlan donaciones, newsletter y funcionalidades generales de la página
 * @type {string} selectedAmount - Cantidad seleccionada para donación
 */
let selectedAmount = '';

// =============================================
// SISTEMA DE DONACIONES
// Funcionalidad para procesar donaciones y pagos seguros
// =============================================

/**
 * Establece la cantidad seleccionada para donación
 * Actualiza el campo de cantidad personalizada con el valor seleccionado
 * @param {number} amount - Cantidad de la donación en pesos mexicanos
 * @returns {void}
 */
function setAmount(amount) {
  selectedAmount = amount;
  document.getElementById('custom-amount').value = amount;
}

/**
 * Limpia la selección de botones de radio y usa cantidad personalizada
 * Permite al usuario ingresar una cantidad personalizada
 * @returns {void}
 */
function clearRadio() {
  selectedAmount = document.getElementById('custom-amount').value;
  const radios = document.querySelectorAll('input[type="radio"]');
  radios.forEach(radio => radio.checked = false);
}

/**
 * Muestra el popup de confirmación de donación
 * Valida la cantidad antes de mostrar la confirmación al usuario
 * @returns {void}
 */
function showConfirmation() {
  const amount = selectedAmount || document.getElementById('custom-amount').value;
  if (!amount) {
    alert('Por favor, ingresa una cantidad válida.');
    return;
  }
  document.getElementById('donation-amount').innerText = `$${amount}`;
  document.getElementById('confirmation-popup').style.display = 'flex';
}

/**
 * Cierra los popups de confirmación y agradecimiento
 * Oculta todos los modales relacionados con donaciones
 * @returns {void}
 */
function closePopup() {
  document.getElementById('confirmation-popup').style.display = 'none';
  document.getElementById('thankyou-popup').style.display = 'none';
}

/**
 * Confirma la donación y redirige a la página de pago
 * Abre la página de pago en una nueva pestaña
 * @returns {void}
 */
function confirmDonation() {
  document.getElementById('confirmation-popup').style.display = 'none';
  window.open('/payment', '_blank');
}
// =============================================
// SISTEMA DE NEWSLETTER
// Funcionalidad de suscripción al boletín informativo de SWAY
// =============================================

/**
 * Muestra confirmación de suscripción al newsletter
 * Valida email y procesa la suscripción mediante API del servidor
 * Maneja casos de suscripciones duplicadas y errores
 * @returns {void}
 */
function showNewsletterConfirmation() {
  const email = document.getElementById('newsletter-email').value;
  
  if (!email) {
    alert('Por favor, ingresa tu email');
    return;
  }
  
  // Validación básica del formato de email
  if (!email.includes('@') || !email.includes('.')) {
    alert('Por favor, ingresa un email válido');
    return;
  }
  
  // Enviar solicitud de suscripción a la API
  suscribirNewsletter(email).then(result => {
    if (result.success) {
      // Verificar si el email ya estaba previamente suscrito
      if (result.already_subscribed) {
        showNewsletterMessage(result.message, 'info');
        document.getElementById('newsletter-email').value = '';
      } else {
        // Nueva suscripción exitosa o reactivación de suscripción
        document.getElementById('newsletter-popup').style.display = 'flex';
        document.getElementById('newsletter-email').value = '';
      }
    } else {
      showNewsletterMessage('Error: ' + result.message, 'error');
    }
  });
}

/**
 * Cierra el popup de confirmación del newsletter
 * Oculta el modal de confirmación de suscripción
 * @returns {void}
 */
function closeNewsletterPopup() {
  document.getElementById('newsletter-popup').style.display = 'none';
}

/**
 * Suscribe un email al newsletter mediante API
 * Envía solicitud de suscripción al servidor y maneja la respuesta
 * @param {string} email - Dirección de email a suscribir
 * @returns {Promise<Object>} Resultado de la suscripción (success, message)
 */
async function suscribirNewsletter(email) {
  try {
    const response = await fetch(API_BASE + '/newsletter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      return { success: true, message: result.message };
    } else {
      return { success: false, message: result.error };
    }
  } catch (error) {
    console.error('Error al suscribir al newsletter:', error);
    return { success: false, message: 'Error de conexión' };
  }
}

// =============================================
// SISTEMA DE CONTACTO
// Funcionalidad para el formulario de contacto y comunicación
// =============================================

/**
 * Muestra confirmación de mensaje enviado (versión simple)
 * Versión básica para formularios sin procesamiento en servidor
 * @param {Event} event - Evento del formulario
 * @returns {void}
 */
function showMessageConfirmation(event) {
  event.preventDefault(); // Prevenir envío por defecto del formulario
  document.getElementById('message-popup').style.display = 'flex';
  // Aquí normalmente se enviarían los datos al servidor usando AJAX
}

/**
 * Envía el formulario de contacto mediante API
 * Procesa datos completos del formulario y maneja respuestas del servidor
 * Incluye validación, estados de carga y manejo de errores
 * @param {Event} event - Evento del formulario
 * @returns {Promise<void>} Formulario procesado
 */
async function enviarContacto(event) {
  event.preventDefault();
  
  const form = document.getElementById('contact-form');
  const submitBtn = document.getElementById('submit-btn');
  const messagePopup = document.getElementById('message-popup');
  const messageText = document.getElementById('message-popup-text');
  
  // Deshabilitar botón durante el envío para evitar múltiples solicitudes
  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando...';
  
  // Obtener y formatear datos del formulario
  const nombre = document.getElementById('nombre-field').value;
  const apellidoPaterno = document.getElementById('apellido-paterno-field').value;
  const apellidoMaterno = document.getElementById('apellido-materno-field').value;
  
  const formData = {
    name: nombre + ' ' + apellidoPaterno + (apellidoMaterno ? ' ' + apellidoMaterno : ''),
    nombre: nombre,
    apellidoPaterno: apellidoPaterno,
    apellidoMaterno: apellidoMaterno,
    email: document.getElementById('email-field').value,
    subject: document.getElementById('subject-field').value,
    message: document.getElementById('message-field').value
  };
  
  try {
    const response = await fetch(API_BASE + '/contacto', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      messageText.textContent = result.message;
      messagePopup.style.display = 'flex';
      form.reset(); // Limpiar formulario
    } else {
      messageText.textContent = result.message || 'Error al enviar el mensaje';
      messagePopup.style.display = 'flex';
    }
    
  } catch (error) {
    console.error('Error:', error);
    messageText.textContent = 'Error de conexión. Por favor, intenta de nuevo.';
    messagePopup.style.display = 'flex';
  } finally {
    // Restaurar estado original del botón
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar mensaje';
  }
}

/**
 * Cierra el popup de mensaje de contacto
 * Oculta el modal de confirmación de envío
 * @returns {void}
 */
function closeMessagePopup() {
  const messagePopup = document.getElementById('message-popup');
  if (messagePopup) {
    messagePopup.style.display = 'none';
  }
}

// =============================================
// INICIALIZACIÓN DE LA PÁGINA
// Configuración inicial al cargar la página principal
// =============================================

/**
 * Inicializa el estado de la página ocultando popups
 * Asegura que todos los modales estén ocultos al cargar la página
 * Establece el estado base para una experiencia de usuario limpia
 * @returns {void}
 */
document.addEventListener("DOMContentLoaded", function () {
  const confirmationPopup = document.getElementById('confirmation-popup');
  const thankyouPopup = document.getElementById('thankyou-popup');
  const newsletterPopup = document.getElementById('newsletter-popup');
  const messagePopup = document.getElementById('message-popup');
  
  if (confirmationPopup) confirmationPopup.style.display = 'none';
  if (thankyouPopup) thankyouPopup.style.display = 'none';
  if (newsletterPopup) newsletterPopup.style.display = 'none';
  if (messagePopup) messagePopup.style.display = 'none';
});
// =============================================
// UTILIDADES DE INTERFAZ
// Funciones auxiliares para mejorar la experiencia de usuario
// =============================================

/**
 * Alterna la visibilidad de la descripción de una tarjeta
 * Muestra u oculta el contenido adicional de tarjetas informativas
 * @param {HTMLElement} card - Elemento de tarjeta que contiene la descripción
 * @returns {void}
 */
function toggleDescription(card) {
  var description = card.querySelector('.description');
  if (description.style.display === "none" || description.style.display === "") {
    description.style.display = "block";
  } else {
    description.style.display = "none";
  }
}
/**
 * Suscribe al newsletter (versión simplificada)
 * Función de compatibilidad para formularios básicos sin validación avanzada
 * @returns {void}
 */
function subscribeNewsletter() {
  var email = document.getElementById('newsletter-email').value;
  if (email) {
    // Simular una solicitud AJAX para suscribir el email
    setTimeout(function () {
      // Mostrar popup de agradecimiento
      document.getElementById('newsletterPopup').style.display = 'block';
    }, 500);
  } else {
    alert('Por favor ingrese un correo electrónico válido.');
  }
}

/**
 * Cierra un popup específico por su ID
 * Utilidad genérica para cerrar cualquier modal por identificador
 * @param {string} popupId - ID del popup a cerrar
 * @returns {void}
 */
function closePopup(popupId) {
  document.getElementById(popupId).style.display = 'none';
}


// =============================================
// FUNCIONALIDADES AVANZADAS DE LA PÁGINA
// Sistema completo de navegación, scroll y componentes interactivos
// =============================================

/**
 * Módulo de funcionalidades avanzadas encapsulado
 * Incluye navegación responsive, efectos de scroll, modales y componentes dinámicos
 * Implementa patrones de diseño modernos para una experiencia web fluida
 */
(function () {
  "use strict";

  /**
   * Aplica la clase .scrolled al body cuando se hace scroll
   * Controla efectos visuales del header durante el desplazamiento de la página
   * @returns {void}
   */
  function toggleScrolled() {
    const selectBody = document.querySelector('body');
    const selectHeader = document.querySelector('#header');
    if (!selectHeader.classList.contains('scroll-up-sticky') && !selectHeader.classList.contains('sticky-top') && !selectHeader.classList.contains('fixed-top')) return;
    window.scrollY > 100 ? selectBody.classList.add('scrolled') : selectBody.classList.remove('scrolled');
  }

  document.addEventListener('scroll', toggleScrolled);
  window.addEventListener('load', toggleScrolled);

  /**
   * Toggle de navegación móvil
   * Controla la apertura y cierre del menú en dispositivos móviles
   * Cambia iconos y clases CSS para animaciones fluidas
   * @returns {void}
   */
  const mobileNavToggleBtn = document.querySelector('.mobile-nav-toggle');

  function mobileNavToogle() {
    document.querySelector('body').classList.toggle('mobile-nav-active');
    mobileNavToggleBtn.classList.toggle('bi-list');
    mobileNavToggleBtn.classList.toggle('bi-x');
  }
  mobileNavToggleBtn.addEventListener('click', mobileNavToogle);

  /**
   * Oculta navegación móvil al hacer clic en enlaces internos
   * Mejora la experiencia de usuario en dispositivos móviles
   * Cierra automáticamente el menú al navegar
   */
  document.querySelectorAll('#navmenu a').forEach(navmenu => {
    navmenu.addEventListener('click', () => {
      if (document.querySelector('.mobile-nav-active')) {
        mobileNavToogle();
      }
    });

  });

  /**
   * Toggle de dropdowns en navegación móvil
   * Controla submenús desplegables en dispositivos móviles
   * Maneja la jerarquía de navegación anidada
   */
  document.querySelectorAll('.navmenu .toggle-dropdown').forEach(navmenu => {
    navmenu.addEventListener('click', function (e) {
      e.preventDefault();
      this.parentNode.classList.toggle('active');
      this.parentNode.nextElementSibling.classList.toggle('dropdown-active');
      e.stopImmediatePropagation();
    });
  });

  /**
   * Preloader de carga de la página
   * Oculta el indicador de carga cuando la página está completamente lista
   * Mejora la percepción de velocidad de carga
   */
  const preloader = document.querySelector('#preloader');
  if (preloader) {
    window.addEventListener('load', () => {
      preloader.remove();
    });
  }

  /**
   * Botón de scroll hacia arriba
   * Funcionalidad para volver suavemente al inicio de la página
   * Aparece cuando el usuario ha hecho scroll hacia abajo
   */
  let scrollTop = document.querySelector('.scroll-top');

  function toggleScrollTop() {
    if (scrollTop) {
      window.scrollY > 100 ? scrollTop.classList.add('active') : scrollTop.classList.remove('active');
    }
  }
  
  if (scrollTop) {
    scrollTop.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  window.addEventListener('load', toggleScrollTop);
  document.addEventListener('scroll', toggleScrollTop);

  /**
   * Inicialización de animaciones en scroll (AOS)
   * Configura parámetros de animación para elementos que aparecen al hacer scroll
   * Optimiza rendimiento ejecutándose solo una vez
   */
  function aosInit() {
    AOS.init({
      duration: 600,
      easing: 'ease-in-out',
      once: true,
      mirror: false
    });
  }
  window.addEventListener('load', aosInit);

  /**
   * Inicializa GLightbox para galerías de imágenes
   * Configura lightbox para visualización ampliada de imágenes
   * Permite navegación entre imágenes con controles táctiles
   */
  const glightbox = GLightbox({
    selector: '.glightbox'
  });

  /**
   * Inicializa sliders Swiper
   * Configura carruseles y presentaciones de contenido
   */
  function initSwiper() {
    document.querySelectorAll(".init-swiper").forEach(function (swiperElement) {
      let config = JSON.parse(
        swiperElement.querySelector(".swiper-config").innerHTML.trim()
      );

      if (swiperElement.classList.contains("swiper-tab")) {
        initSwiperWithCustomPagination(swiperElement, config);
      } else {
        new Swiper(swiperElement, config);
      }
    });
  }

  window.addEventListener("load", initSwiper);

  /**
   * Toggle de Preguntas Frecuentes (FAQ)
   * Controla la expansión y colapso de preguntas
   */
  document.querySelectorAll('.faq-item h3, .faq-item .faq-toggle').forEach((faqItem) => {
    faqItem.addEventListener('click', () => {
      faqItem.parentNode.classList.toggle('faq-active');
    });
  });

  /**
   * Anima barras de habilidades al ser reveladas
   * Usa Waypoint para activar animaciones cuando son visibles
   */
  let skillsAnimation = document.querySelectorAll('.skills-animation');
  skillsAnimation.forEach((item) => {
    new Waypoint({
      element: item,
      offset: '80%',
      handler: function (direction) {
        let progress = item.querySelectorAll('.progress .progress-bar');
        progress.forEach(el => {
          el.style.width = el.getAttribute('aria-valuenow') + '%';
        });
      }
    });
  });

  /**
   * Inicializa layout Isotope y filtros
   * Configura grillas dinámicas y filtros de contenido
   */
  document.querySelectorAll('.isotope-layout').forEach(function (isotopeItem) {
    let layout = isotopeItem.getAttribute('data-layout') ?? 'masonry';
    let filter = isotopeItem.getAttribute('data-default-filter') ?? '*';
    let sort = isotopeItem.getAttribute('data-sort') ?? 'original-order';

    let initIsotope;
    imagesLoaded(isotopeItem.querySelector('.isotope-container'), function () {
      initIsotope = new Isotope(isotopeItem.querySelector('.isotope-container'), {
        itemSelector: '.isotope-item',
        layoutMode: layout,
        filter: filter,
        sortBy: sort
      });
    });

    isotopeItem.querySelectorAll('.isotope-filters li').forEach(function (filters) {
      filters.addEventListener('click', function () {
        isotopeItem.querySelector('.isotope-filters .filter-active').classList.remove('filter-active');
        this.classList.add('filter-active');
        initIsotope.arrange({
          filter: this.getAttribute('data-filter')
        });
        if (typeof aosInit === 'function') {
          aosInit();
        }
      }, false);
    });

  });

  /**
   * Corrige posición de scroll al cargar página con enlaces hash
   * Mejora la navegación con anclas internas
   */
  window.addEventListener('load', function (e) {
    if (window.location.hash) {
      if (document.querySelector(window.location.hash)) {
        setTimeout(() => {
          let section = document.querySelector(window.location.hash);
          let scrollMarginTop = getComputedStyle(section).scrollMarginTop;
          window.scrollTo({
            top: section.offsetTop - parseInt(scrollMarginTop),
            behavior: 'smooth'
          });
        }, 100);
      }
    }
  });

  /**
   * Scrollspy de navegación
   * Resalta enlaces del menú según la sección visible
   */
  let navmenulinks = document.querySelectorAll('.navmenu a');

  function navmenuScrollspy() {
    navmenulinks.forEach(navmenulink => {
      if (!navmenulink.hash) return;
      let section = document.querySelector(navmenulink.hash);
      if (!section) return;
      let position = window.scrollY + 200;
      if (position >= section.offsetTop && position <= (section.offsetTop + section.offsetHeight)) {
        document.querySelectorAll('.navmenu a.active').forEach(link => link.classList.remove('active'));
        navmenulink.classList.add('active');
      } else {
        navmenulink.classList.remove('active');
      }
    })
  }
  window.addEventListener('load', navmenuScrollspy);
  document.addEventListener('scroll', navmenuScrollspy);



// =============================================
// SISTEMA DE NOTIFICACIONES
// Mensajes y notificaciones para el usuario
// =============================================

/**
 * Muestra mensajes temporales del newsletter
 * @param {string} message - Mensaje a mostrar
 * @param {string} type - Tipo de mensaje ('info', 'error', 'success')
 */
function showNewsletterMessage(message, type = 'info') {
  // Crear elemento de mensaje temporal
  const messageDiv = document.createElement('div');
  messageDiv.style.cssText = `
    position: fixed;
    top: 2rem;
    right: 2rem;
    z-index: 10000;
    max-width: 400px;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transform: translateX(100%);
    transition: transform 0.3s ease;
  `;
  
  // Establecer colores según el tipo
  if (type === 'error') {
    messageDiv.style.backgroundColor = '#dc3545';
    messageDiv.innerHTML = `<i class="bi bi-exclamation-triangle" style="margin-right: 0.5rem;"></i>${message}`;
  } else {
    messageDiv.style.backgroundColor = '#0ea5e9';
    messageDiv.innerHTML = `<i class="bi bi-info-circle" style="margin-right: 0.5rem;"></i>${message}`;
  }
  
  document.body.appendChild(messageDiv);
  
  // Mostrar mensaje
  setTimeout(() => {
    messageDiv.style.transform = 'translateX(0)';
  }, 100);
  
  // Ocultar después de 4 segundos
  setTimeout(() => {
    messageDiv.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
    }, 300);
  }, 4000);
}

})();