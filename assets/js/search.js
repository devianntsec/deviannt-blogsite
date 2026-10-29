/* Buscador. Antes: <script> inline en el partial del tema (bloqueado por la CSP).
   La URL del índice y el texto 'sin resultados' llegan por data-* de #search-results. */
  const DEFAULT_CONFIG = {
    search: {
      minChars: 1,              // Mínimo de caracteres para buscar
      maxResults: 5,            // Máximo de resultados a mostrar
      fields: {                 // Campos en los que se busca
        title: true,
        description: true,
        section: true,
        contents: true
      },
      // Configuración de búsqueda simplificada
      strictMode: true          // Modo estricto: solo devuelve coincidencias exactas
    }
  };

  // Mostrar la vista de resultados y ocultar el contenido de la página
  function showResultsView() {
    const wrap = document.getElementById('search-result-wrapper');
    if (wrap) wrap.style.display = 'block';
    document.querySelectorAll('#main-wrapper > .container > .row')
      .forEach(el => el.classList.add('d-none'));
  }

  // Ocultar la vista de resultados y restaurar el contenido de la página
  function hideResultsView() {
    const wrap = document.getElementById('search-result-wrapper');
    if (wrap) wrap.style.display = 'none';
    document.querySelectorAll('#main-wrapper > .container > .row')
      .forEach(el => el.classList.remove('d-none'));
  }

  class FastSearch {
    constructor({
      searchInput, resultsContainer, json,
      searchResultTemplate = null,
      noResultsText = null,
    }) {
      this.searchInput = searchInput;
      this.resultsContainer = resultsContainer;
      this.json = json;
      this.searchResultTemplate = searchResultTemplate;
      this.noResultsText = noResultsText;

      this.init();
    }

    init() {
      // El índice (texto completo de todos los posts) ya NO se descarga al abrir la página:
      // solo cuando la persona enfoca el buscador o empieza a escribir.
      this.indexPromise = null;
      this.searchInput.addEventListener('focus', () => this.ensureIndex(), { once: true });
      this.searchInput.addEventListener('input', () => {
        if (this.searchIndex) {
          this.performSearch(this.searchInput.value);
          return;
        }
        this.resultsContainer.innerHTML = '<li class="search-message">Cargando índice de búsqueda...</li>';
        this.ensureIndex().then(() => {
          // Re-ejecuta con lo que haya escrito mientras cargaba el índice.
          if (this.searchIndex) this.performSearch(this.searchInput.value);
        });
      });
    }

    // Descarga el índice una sola vez; si falla, permite reintentar en el siguiente evento.
    ensureIndex() {
      if (!this.indexPromise) {
        this.indexPromise = this.loadSearchIndex().then(() => {
          if (!this.searchIndex) this.indexPromise = null;
        });
      }
      return this.indexPromise;
    }

    // Carga el índice de búsqueda
    async loadSearchIndex() {
      try {
        const response = await fetch(this.json);
        if (!response.ok) throw new Error('No se pudo cargar el índice de búsqueda');
        const data = await response.json();

        this.searchIndex = data.map(item => ({
          ...item,
          // Convierte a minúsculas para búsqueda sin distinguir mayúsculas
          searchableTitle: item.title?.toLowerCase() || '',
          searchableDesc: item.desc?.toLowerCase() || '',
          searchableSection: item.section?.toLowerCase() || '',
          searchableContents: item.contents?.toLowerCase() || ''
        }));
      } catch (error) {
        console.error('Error al cargar el índice de búsqueda:', error);
        this.resultsContainer.innerHTML = '<li class="search-message">Error al cargar el índice de búsqueda...</li>';
      }
    }

    escapeHtml(unsafe) {
      if (!unsafe) return '';
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    // Comprueba si el texto contiene el término (coincidencia exacta)
    containsTerm(text, term) {
      if (!text || !term) return false;
      return text.includes(term);
    }

    performSearch(query) {
      // Limpia y normaliza la consulta
      query = query.toLowerCase().trim();

      // Comprueba si la consulta es válida
      if (!query || !this.searchIndex || query.length < DEFAULT_CONFIG.search.minChars) {
        this.resultsContainer.innerHTML = '';
        hideResultsView();
        return;
      }

      // Separa la consulta en palabras (útil para varios idiomas)
      const searchTerms = [
        query, // La consulta completa, que debe coincidir siempre
        ...query.split(/\s+/).filter(term => term.length > 0) // Cada palabra por separado
      ];

      // Elimina duplicados
      const uniqueTerms = [...new Set(searchTerms)];

      // Indica si la consulta completa debe coincidir
      const requireFullQueryMatch = DEFAULT_CONFIG.search.strictMode;

      // Búsqueda
      const results = this.searchIndex
        .map(item => {
          // Comprueba primero si la consulta completa coincide (obligatorio en modo estricto)
          const fullQueryMatched = this.checkFieldsForMatch(item, uniqueTerms[0]);

          // Si el modo estricto está activo y la consulta completa no coincide, se descarta
          if (requireFullQueryMatch && !fullQueryMatched) {
            return { item, score: 0, matched: false };
          }

          // Calcula la puntuación
          let score = 0;
          let matchedTermsCount = 0;
          let matchedInTitle = false;

          // Revisa la coincidencia de cada término
          uniqueTerms.forEach((term, index) => {
            // La consulta completa (index=0) tiene más peso
            const isFullQuery = index === 0;
            const matched = this.checkFieldsForMatch(item, term);

            if (matched) {
              matchedTermsCount++;

              // Suma puntos según el campo donde coincide
              if (matched.inTitle) {
                score += isFullQuery ? 10 : 5;
                matchedInTitle = true;
              }
              if (matched.inDesc) {
                score += isFullQuery ? 8 : 4;
              }
              if (matched.inSection) {
                score += isFullQuery ? 6 : 3;
              }
              if (matched.inContents) {
                score += isFullQuery ? 4 : 2;
              }
            }
          });

          // Proporción de términos que coinciden
          const matchRatio = matchedTermsCount / uniqueTerms.length;

          // Puntuación final
          const finalScore = score * matchRatio * (matchedInTitle ? 1.5 : 1);

          return {
            item,
            score: finalScore,
            matched: fullQueryMatched // Solo es válido si coincide la consulta completa
          };
        })
        .filter(result => result.matched)
        .sort((a, b) => b.score - a.score)
        .slice(0, DEFAULT_CONFIG.search.maxResults)
        .map(result => result.item);

      // Muestra los resultados
      if (results.length === 0) {
        this.resultsContainer.innerHTML = '<p class="mt-5">' + this.escapeHtml(this.noResultsText || 'No se encontraron resultados.') + '</p>';
        showResultsView();
        return;
      }

      const searchItems = results.map((item) => {
        let categories = '';
        let tags = '';
        if (item.categories) {
          categories = item.categories.join(', ');
          categories = `<div class="me-sm-4"><i class="far fa-folder fa-fw"></i>${categories}</div>`;
        }
        if (item.tags) {
          tags = item.tags.join(', ');
          tags = `<div><i class="fa fa-tag fa-fw"></i>${tags}</div>`
        }
        return `
        <article class="px-1 px-sm-2 px-lg-4 px-xl-0">
          <header>
            <h2><a href="${this.escapeHtml(item.permalink)}">${this.escapeHtml(item.title)}</a></h2>
            <div class="post-meta d-flex flex-column flex-sm-row text-muted mt-1 mb-1">
              ${categories}
              ${tags}
            </div>
          </header>
          <p>${this.escapeHtml(item.contents)}</p>
        </article>
      `;
      }).join('');

      this.resultsContainer.innerHTML = searchItems;
      showResultsView();
    }

    // Comprueba si un término coincide con algún campo del elemento
    checkFieldsForMatch(item, term) {
      const matches = {
        inTitle: false,
        inDesc: false,
        inSection: false,
        inContents: false
      };

      // Revisa cada campo
      if (DEFAULT_CONFIG.search.fields.title && this.containsTerm(item.searchableTitle, term)) {
        matches.inTitle = true;
      }

      if (DEFAULT_CONFIG.search.fields.description && this.containsTerm(item.searchableDesc, term)) {
        matches.inDesc = true;
      }

      if (DEFAULT_CONFIG.search.fields.section && this.containsTerm(item.searchableSection, term)) {
        matches.inSection = true;
      }

      if (DEFAULT_CONFIG.search.fields.contents && this.containsTerm(item.searchableContents, term)) {
        matches.inContents = true;
      }

      // Si algún campo coincide, devuelve la información de coincidencia
      if (matches.inTitle || matches.inDesc || matches.inSection || matches.inContents) {
        return matches;
      }

      // Si no coincide ningún campo, devuelve false
      return false;
    }
  }

  const searchResultsEl = document.getElementById('search-results');
  const search = new FastSearch({
    searchInput: document.getElementById('search-input'),
    resultsContainer: searchResultsEl,
    json: searchResultsEl.dataset.json,
    noResultsText: searchResultsEl.dataset.noResults
  });
