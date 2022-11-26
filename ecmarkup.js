'use strict';
let sdoBox = {
  init() {
    this.$alternativeId = null;
    this.$outer = document.createElement('div');
    this.$outer.classList.add('toolbox-container');
    this.$container = document.createElement('div');
    this.$container.classList.add('toolbox');
    this.$displayLink = document.createElement('a');
    this.$displayLink.setAttribute('href', '#');
    this.$displayLink.textContent = 'Syntax-Directed Operations';
    this.$displayLink.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      referencePane.showSDOs(sdoMap[this.$alternativeId] || {}, this.$alternativeId);
    });
    this.$container.appendChild(this.$displayLink);
    this.$outer.appendChild(this.$container);
    document.body.appendChild(this.$outer);
  },

  activate(el) {
    clearTimeout(this.deactiveTimeout);
    Toolbox.deactivate();
    this.$alternativeId = el.id;
    let numSdos = Object.keys(sdoMap[this.$alternativeId] || {}).length;
    this.$displayLink.textContent = 'Syntax-Directed Operations (' + numSdos + ')';
    this.$outer.classList.add('active');
    let top = el.offsetTop - this.$outer.offsetHeight;
    let left = el.offsetLeft + 50 - 10; // 50px = padding-left(=75px) + text-indent(=-25px)
    this.$outer.setAttribute('style', 'left: ' + left + 'px; top: ' + top + 'px');
    if (top < document.body.scrollTop) {
      this.$container.scrollIntoView();
    }
  },

  deactivate() {
    clearTimeout(this.deactiveTimeout);
    this.$outer.classList.remove('active');
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof sdoMap == 'undefined') {
    console.error('could not find sdo map');
    return;
  }
  sdoBox.init();

  let insideTooltip = false;
  sdoBox.$outer.addEventListener('pointerenter', () => {
    insideTooltip = true;
  });
  sdoBox.$outer.addEventListener('pointerleave', () => {
    insideTooltip = false;
    sdoBox.deactivate();
  });

  sdoBox.deactiveTimeout = null;
  [].forEach.call(document.querySelectorAll('emu-grammar[type=definition] emu-rhs'), node => {
    node.addEventListener('pointerenter', function () {
      sdoBox.activate(this);
    });

    node.addEventListener('pointerleave', () => {
      sdoBox.deactiveTimeout = setTimeout(() => {
        if (!insideTooltip) {
          sdoBox.deactivate();
        }
      }, 500);
    });
  });

  document.addEventListener(
    'keydown',
    debounce(e => {
      if (e.code === 'Escape') {
        sdoBox.deactivate();
      }
    })
  );
});

'use strict';
function Search(menu) {
  this.menu = menu;
  this.$search = document.getElementById('menu-search');
  this.$searchBox = document.getElementById('menu-search-box');
  this.$searchResults = document.getElementById('menu-search-results');

  this.loadBiblio();

  document.addEventListener('keydown', this.documentKeydown.bind(this));

  this.$searchBox.addEventListener(
    'keydown',
    debounce(this.searchBoxKeydown.bind(this), { stopPropagation: true })
  );
  this.$searchBox.addEventListener(
    'keyup',
    debounce(this.searchBoxKeyup.bind(this), { stopPropagation: true })
  );

  // Perform an initial search if the box is not empty.
  if (this.$searchBox.value) {
    this.search(this.$searchBox.value);
  }
}

Search.prototype.loadBiblio = function () {
  if (typeof biblio === 'undefined') {
    console.error('could not find biblio');
    this.biblio = { refToClause: {}, entries: [] };
  } else {
    this.biblio = biblio;
    this.biblio.clauses = this.biblio.entries.filter(e => e.type === 'clause');
    this.biblio.byId = this.biblio.entries.reduce((map, entry) => {
      map[entry.id] = entry;
      return map;
    }, {});
    let refParentClause = Object.create(null);
    this.biblio.refParentClause = refParentClause;
    let refsByClause = this.biblio.refsByClause;
    Object.keys(refsByClause).forEach(clause => {
      refsByClause[clause].forEach(ref => {
        refParentClause[ref] = clause;
      });
    });
  }
};

Search.prototype.documentKeydown = function (e) {
  if (e.key === '/') {
    e.preventDefault();
    e.stopPropagation();
    this.triggerSearch();
  }
};

Search.prototype.searchBoxKeydown = function (e) {
  e.stopPropagation();
  e.preventDefault();
  if (e.keyCode === 191 && e.target.value.length === 0) {
    e.preventDefault();
  } else if (e.keyCode === 13) {
    e.preventDefault();
    this.selectResult();
  }
};

Search.prototype.searchBoxKeyup = function (e) {
  if (e.keyCode === 13 || e.keyCode === 9) {
    return;
  }

  this.search(e.target.value);
};

Search.prototype.triggerSearch = function () {
  if (this.menu.isVisible()) {
    this._closeAfterSearch = false;
  } else {
    this._closeAfterSearch = true;
    this.menu.show();
  }

  this.$searchBox.focus();
  this.$searchBox.select();
};
// bit 12 - Set if the result starts with searchString
// bits 8-11: 8 - number of chunks multiplied by 2 if cases match, otherwise 1.
// bits 1-7: 127 - length of the entry
// General scheme: prefer case sensitive matches with fewer chunks, and otherwise
// prefer shorter matches.
function relevance(result) {
  let relevance = 0;

  relevance = Math.max(0, 8 - result.match.chunks) << 7;

  if (result.match.caseMatch) {
    relevance *= 2;
  }

  if (result.match.prefix) {
    relevance += 2048;
  }

  relevance += Math.max(0, 255 - result.key.length);

  return relevance;
}

Search.prototype.search = function (searchString) {
  if (searchString === '') {
    this.displayResults([]);
    this.hideSearch();
    return;
  } else {
    this.showSearch();
  }

  if (searchString.length === 1) {
    this.displayResults([]);
    return;
  }

  let results;

  if (/^[\d.]*$/.test(searchString)) {
    results = this.biblio.clauses
      .filter(clause => clause.number.substring(0, searchString.length) === searchString)
      .map(clause => ({ key: getKey(clause), entry: clause }));
  } else {
    results = [];

    for (let i = 0; i < this.biblio.entries.length; i++) {
      let entry = this.biblio.entries[i];
      let key = getKey(entry);
      if (!key) {
        // biblio entries without a key aren't searchable
        continue;
      }

      let match = fuzzysearch(searchString, key);
      if (match) {
        results.push({ key, entry, match });
      }
    }

    results.forEach(result => {
      result.relevance = relevance(result, searchString);
    });

    results = results.sort((a, b) => b.relevance - a.relevance);
  }

  if (results.length > 50) {
    results = results.slice(0, 50);
  }

  this.displayResults(results);
};
Search.prototype.hideSearch = function () {
  this.$search.classList.remove('active');
};

Search.prototype.showSearch = function () {
  this.$search.classList.add('active');
};

Search.prototype.selectResult = function () {
  let $first = this.$searchResults.querySelector('li:first-child a');

  if ($first) {
    document.location = $first.getAttribute('href');
  }

  this.$searchBox.value = '';
  this.$searchBox.blur();
  this.displayResults([]);
  this.hideSearch();

  if (this._closeAfterSearch) {
    this.menu.hide();
  }
};

Search.prototype.displayResults = function (results) {
  if (results.length > 0) {
    this.$searchResults.classList.remove('no-results');

    let html = '<ul>';

    results.forEach(result => {
      let key = result.key;
      let entry = result.entry;
      let id = entry.id;
      let cssClass = '';
      let text = '';

      if (entry.type === 'clause') {
        let number = entry.number ? entry.number + ' ' : '';
        text = number + key;
        cssClass = 'clause';
        id = entry.id;
      } else if (entry.type === 'production') {
        text = key;
        cssClass = 'prod';
        id = entry.id;
      } else if (entry.type === 'op') {
        text = key;
        cssClass = 'op';
        id = entry.id || entry.refId;
      } else if (entry.type === 'term') {
        text = key;
        cssClass = 'term';
        id = entry.id || entry.refId;
      }

      if (text) {
        // prettier-ignore
        html += `<li class=menu-search-result-${cssClass}><a href="${makeLinkToId(id)}">${text}</a></li>`;
      }
    });

    html += '</ul>';

    this.$searchResults.innerHTML = html;
  } else {
    this.$searchResults.innerHTML = '';
    this.$searchResults.classList.add('no-results');
  }
};

function getKey(item) {
  if (item.key) {
    return item.key;
  }
  switch (item.type) {
    case 'clause':
      return item.title || item.titleHTML;
    case 'production':
      return item.name;
    case 'op':
      return item.aoid;
    case 'term':
      return item.term;
    case 'table':
    case 'figure':
    case 'example':
    case 'note':
      return item.caption;
    case 'step':
      return item.id;
    default:
      throw new Error("Can't get key for " + item.type);
  }
}

function Menu() {
  this.$toggle = document.getElementById('menu-toggle');
  this.$menu = document.getElementById('menu');
  this.$toc = document.querySelector('menu-toc > ol');
  this.$pins = document.querySelector('#menu-pins');
  this.$pinList = document.getElementById('menu-pins-list');
  this.$toc = document.querySelector('#menu-toc > ol');
  this.$specContainer = document.getElementById('spec-container');
  this.search = new Search(this);

  this._pinnedIds = {};
  this.loadPinEntries();

  // toggle menu
  this.$toggle.addEventListener('click', this.toggle.bind(this));

  // keydown events for pinned clauses
  document.addEventListener('keydown', this.documentKeydown.bind(this));

  // toc expansion
  let tocItems = this.$menu.querySelectorAll('#menu-toc li');
  for (let i = 0; i < tocItems.length; i++) {
    let $item = tocItems[i];
    $item.addEventListener('click', event => {
      $item.classList.toggle('active');
      event.stopPropagation();
    });
  }

  // close toc on toc item selection
  let tocLinks = this.$menu.querySelectorAll('#menu-toc li > a');
  for (let i = 0; i < tocLinks.length; i++) {
    let $link = tocLinks[i];
    $link.addEventListener('click', event => {
      this.toggle();
      event.stopPropagation();
    });
  }

  // update active clause on scroll
  window.addEventListener('scroll', debounce(this.updateActiveClause.bind(this)));
  this.updateActiveClause();

  // prevent menu scrolling from scrolling the body
  this.$toc.addEventListener('wheel', e => {
    let target = e.currentTarget;
    let offTop = e.deltaY < 0 && target.scrollTop === 0;
    if (offTop) {
      e.preventDefault();
    }
    let offBottom = e.deltaY > 0 && target.offsetHeight + target.scrollTop >= target.scrollHeight;

    if (offBottom) {
      e.preventDefault();
    }
  });
}

Menu.prototype.documentKeydown = function (e) {
  e.stopPropagation();
  if (e.keyCode === 80) {
    this.togglePinEntry();
  } else if (e.keyCode > 48 && e.keyCode < 58) {
    this.selectPin(e.keyCode - 49);
  }
};

Menu.prototype.updateActiveClause = function () {
  this.setActiveClause(findActiveClause(this.$specContainer));
};

Menu.prototype.setActiveClause = function (clause) {
  this.$activeClause = clause;
  this.revealInToc(this.$activeClause);
};

Menu.prototype.revealInToc = function (path) {
  let current = this.$toc.querySelectorAll('li.revealed');
  for (let i = 0; i < current.length; i++) {
    current[i].classList.remove('revealed');
    current[i].classList.remove('revealed-leaf');
  }

  current = this.$toc;
  let index = 0;
  outer: while (index < path.length) {
    let children = current.children;
    for (let i = 0; i < children.length; i++) {
      if ('#' + path[index].id === children[i].children[1].hash) {
        children[i].classList.add('revealed');
        if (index === path.length - 1) {
          children[i].classList.add('revealed-leaf');
          let rect = children[i].getBoundingClientRect();
          // this.$toc.getBoundingClientRect().top;
          let tocRect = this.$toc.getBoundingClientRect();
          if (rect.top + 10 > tocRect.bottom) {
            this.$toc.scrollTop =
              this.$toc.scrollTop + (rect.top - tocRect.bottom) + (rect.bottom - rect.top);
          } else if (rect.top < tocRect.top) {
            this.$toc.scrollTop = this.$toc.scrollTop - (tocRect.top - rect.top);
          }
        }
        current = children[i].querySelector('ol');
        index++;
        continue outer;
      }
    }
    console.log('could not find location in table of contents', path);
    break;
  }
};

function findActiveClause(root, path) {
  let clauses = getChildClauses(root);
  path = path || [];

  for (let $clause of clauses) {
    let rect = $clause.getBoundingClientRect();
    let $header = $clause.querySelector('h1');
    let marginTop = Math.max(
      parseInt(getComputedStyle($clause)['margin-top']),
      parseInt(getComputedStyle($header)['margin-top'])
    );

    if (rect.top - marginTop <= 1 && rect.bottom > 0) {
      return findActiveClause($clause, path.concat($clause)) || path;
    }
  }

  return path;
}

function* getChildClauses(root) {
  for (let el of root.children) {
    switch (el.nodeName) {
      // descend into <emu-import>
      case 'EMU-IMPORT':
        yield* getChildClauses(el);
        break;

      // accept <emu-clause>, <emu-intro>, and <emu-annex>
      case 'EMU-CLAUSE':
      case 'EMU-INTRO':
      case 'EMU-ANNEX':
        yield el;
    }
  }
}

Menu.prototype.toggle = function () {
  this.$menu.classList.toggle('active');
};

Menu.prototype.show = function () {
  this.$menu.classList.add('active');
};

Menu.prototype.hide = function () {
  this.$menu.classList.remove('active');
};

Menu.prototype.isVisible = function () {
  return this.$menu.classList.contains('active');
};

Menu.prototype.showPins = function () {
  this.$pins.classList.add('active');
};

Menu.prototype.hidePins = function () {
  this.$pins.classList.remove('active');
};

Menu.prototype.addPinEntry = function (id) {
  let entry = this.search.biblio.byId[id];
  if (!entry) {
    // id was deleted after pin (or something) so remove it
    delete this._pinnedIds[id];
    this.persistPinEntries();
    return;
  }

  if (entry.type === 'clause') {
    let prefix;
    if (entry.number) {
      prefix = entry.number + ' ';
    } else {
      prefix = '';
    }
    // prettier-ignore
    this.$pinList.innerHTML += `<li><a href="${makeLinkToId(entry.id)}">${prefix}${entry.titleHTML}</a></li>`;
  } else {
    this.$pinList.innerHTML += `<li><a href="${makeLinkToId(entry.id)}">${getKey(entry)}</a></li>`;
  }

  if (Object.keys(this._pinnedIds).length === 0) {
    this.showPins();
  }
  this._pinnedIds[id] = true;
  this.persistPinEntries();
};

Menu.prototype.removePinEntry = function (id) {
  let item = this.$pinList.querySelector(`a[href="${makeLinkToId(id)}"]`).parentNode;
  this.$pinList.removeChild(item);
  delete this._pinnedIds[id];
  if (Object.keys(this._pinnedIds).length === 0) {
    this.hidePins();
  }

  this.persistPinEntries();
};

Menu.prototype.persistPinEntries = function () {
  try {
    if (!window.localStorage) return;
  } catch (e) {
    return;
  }

  localStorage.pinEntries = JSON.stringify(Object.keys(this._pinnedIds));
};

Menu.prototype.loadPinEntries = function () {
  try {
    if (!window.localStorage) return;
  } catch (e) {
    return;
  }

  let pinsString = window.localStorage.pinEntries;
  if (!pinsString) return;
  let pins = JSON.parse(pinsString);
  for (let i = 0; i < pins.length; i++) {
    this.addPinEntry(pins[i]);
  }
};

Menu.prototype.togglePinEntry = function (id) {
  if (!id) {
    id = this.$activeClause[this.$activeClause.length - 1].id;
  }

  if (this._pinnedIds[id]) {
    this.removePinEntry(id);
  } else {
    this.addPinEntry(id);
  }
};

Menu.prototype.selectPin = function (num) {
  document.location = this.$pinList.children[num].children[0].href;
};

let menu;

document.addEventListener('DOMContentLoaded', init);

function debounce(fn, opts) {
  opts = opts || {};
  let timeout;
  return function (e) {
    if (opts.stopPropagation) {
      e.stopPropagation();
    }
    let args = arguments;
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      timeout = null;
      fn.apply(this, args);
    }, 150);
  };
}

let CLAUSE_NODES = ['EMU-CLAUSE', 'EMU-INTRO', 'EMU-ANNEX'];
function findContainer($elem) {
  let parentClause = $elem.parentNode;
  while (parentClause && CLAUSE_NODES.indexOf(parentClause.nodeName) === -1) {
    parentClause = parentClause.parentNode;
  }
  return parentClause;
}

function findLocalReferences(parentClause, name) {
  let vars = parentClause.querySelectorAll('var');
  let references = [];

  for (let i = 0; i < vars.length; i++) {
    let $var = vars[i];

    if ($var.innerHTML === name) {
      references.push($var);
    }
  }

  return references;
}

let REFERENCED_CLASSES = Array.from({ length: 7 }, (x, i) => `referenced${i}`);
function chooseHighlightIndex(parentClause) {
  let counts = REFERENCED_CLASSES.map($class => parentClause.getElementsByClassName($class).length);
  // Find the earliest index with the lowest count.
  let minCount = Infinity;
  let index = null;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] < minCount) {
      minCount = counts[i];
      index = i;
    }
  }
  return index;
}

function toggleFindLocalReferences($elem) {
  let parentClause = findContainer($elem);
  let references = findLocalReferences(parentClause, $elem.innerHTML);
  if ($elem.classList.contains('referenced')) {
    references.forEach($reference => {
      $reference.classList.remove('referenced', ...REFERENCED_CLASSES);
    });
  } else {
    let index = chooseHighlightIndex(parentClause);
    references.forEach($reference => {
      $reference.classList.add('referenced', `referenced${index}`);
    });
  }
}

function installFindLocalReferences() {
  document.addEventListener('click', e => {
    if (e.target.nodeName === 'VAR') {
      toggleFindLocalReferences(e.target);
    }
  });
}

document.addEventListener('DOMContentLoaded', installFindLocalReferences);

// The following license applies to the fuzzysearch function
// The MIT License (MIT)
// Copyright © 2015 Nicolas Bevacqua
// Copyright © 2016 Brian Terlson
// Permission is hereby granted, free of charge, to any person obtaining a copy of
// this software and associated documentation files (the "Software"), to deal in
// the Software without restriction, including without limitation the rights to
// use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
// the Software, and to permit persons to whom the Software is furnished to do so,
// subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
// FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
// IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
function fuzzysearch(searchString, haystack, caseInsensitive) {
  let tlen = haystack.length;
  let qlen = searchString.length;
  let chunks = 1;
  let finding = false;

  if (qlen > tlen) {
    return false;
  }

  if (qlen === tlen) {
    if (searchString === haystack) {
      return { caseMatch: true, chunks: 1, prefix: true };
    } else if (searchString.toLowerCase() === haystack.toLowerCase()) {
      return { caseMatch: false, chunks: 1, prefix: true };
    } else {
      return false;
    }
  }

  let j = 0;
  outer: for (let i = 0; i < qlen; i++) {
    let nch = searchString[i];
    while (j < tlen) {
      let targetChar = haystack[j++];
      if (targetChar === nch) {
        finding = true;
        continue outer;
      }
      if (finding) {
        chunks++;
        finding = false;
      }
    }

    if (caseInsensitive) {
      return false;
    }

    return fuzzysearch(searchString.toLowerCase(), haystack.toLowerCase(), true);
  }

  return { caseMatch: !caseInsensitive, chunks, prefix: j <= qlen };
}

let referencePane = {
  init() {
    this.$container = document.createElement('div');
    this.$container.setAttribute('id', 'references-pane-container');

    let $spacer = document.createElement('div');
    $spacer.setAttribute('id', 'references-pane-spacer');
    $spacer.classList.add('menu-spacer');

    this.$pane = document.createElement('div');
    this.$pane.setAttribute('id', 'references-pane');

    this.$container.appendChild($spacer);
    this.$container.appendChild(this.$pane);

    this.$header = document.createElement('div');
    this.$header.classList.add('menu-pane-header');
    this.$headerText = document.createElement('span');
    this.$header.appendChild(this.$headerText);
    this.$headerRefId = document.createElement('a');
    this.$header.appendChild(this.$headerRefId);
    this.$closeButton = document.createElement('span');
    this.$closeButton.setAttribute('id', 'references-pane-close');
    this.$closeButton.addEventListener('click', () => {
      this.deactivate();
    });
    this.$header.appendChild(this.$closeButton);

    this.$pane.appendChild(this.$header);
    let tableContainer = document.createElement('div');
    tableContainer.setAttribute('id', 'references-pane-table-container');

    this.$table = document.createElement('table');
    this.$table.setAttribute('id', 'references-pane-table');

    this.$tableBody = this.$table.createTBody();

    tableContainer.appendChild(this.$table);
    this.$pane.appendChild(tableContainer);

    menu.$specContainer.appendChild(this.$container);
  },

  activate() {
    this.$container.classList.add('active');
  },

  deactivate() {
    this.$container.classList.remove('active');
    this.state = null;
  },

  showReferencesFor(entry) {
    this.activate();
    this.state = { type: 'ref', id: entry.id };
    this.$headerText.textContent = 'References to ';
    let newBody = document.createElement('tbody');
    let previousId;
    let previousCell;
    let dupCount = 0;
    this.$headerRefId.textContent = '#' + entry.id;
    this.$headerRefId.setAttribute('href', makeLinkToId(entry.id));
    this.$headerRefId.style.display = 'inline';
    (entry.referencingIds || [])
      .map(id => {
        let cid = menu.search.biblio.refParentClause[id];
        let clause = menu.search.biblio.byId[cid];
        if (clause == null) {
          throw new Error('could not find clause for id ' + cid);
        }
        return { id, clause };
      })
      .sort((a, b) => sortByClauseNumber(a.clause, b.clause))
      .forEach(record => {
        if (previousId === record.clause.id) {
          previousCell.innerHTML += ` (<a href="${makeLinkToId(record.id)}">${dupCount + 2}</a>)`;
          dupCount++;
        } else {
          let row = newBody.insertRow();
          let cell = row.insertCell();
          cell.innerHTML = record.clause.number;
          cell = row.insertCell();
          cell.innerHTML = `<a href="${makeLinkToId(record.id)}">${record.clause.titleHTML}</a>`;
          previousCell = cell;
          previousId = record.clause.id;
          dupCount = 0;
        }
      }, this);
    this.$table.removeChild(this.$tableBody);
    this.$tableBody = newBody;
    this.$table.appendChild(this.$tableBody);
  },

  showSDOs(sdos, alternativeId) {
    let rhs = document.getElementById(alternativeId);
    let parentName = rhs.parentNode.getAttribute('name');
    let colons = rhs.parentNode.querySelector('emu-geq');
    rhs = rhs.cloneNode(true);
    rhs.querySelectorAll('emu-params,emu-constraints').forEach(e => {
      e.remove();
    });
    rhs.querySelectorAll('[id]').forEach(e => {
      e.removeAttribute('id');
    });
    rhs.querySelectorAll('a').forEach(e => {
      e.parentNode.replaceChild(document.createTextNode(e.textContent), e);
    });

    // prettier-ignore
    this.$headerText.innerHTML = `Syntax-Directed Operations for<br><a href="${makeLinkToId(alternativeId)}" class="menu-pane-header-production"><emu-nt>${parentName}</emu-nt> ${colons.outerHTML} </a>`;
    this.$headerText.querySelector('a').append(rhs);
    this.showSDOsBody(sdos, alternativeId);
  },

  showSDOsBody(sdos, alternativeId) {
    this.activate();
    this.state = { type: 'sdo', id: alternativeId, html: this.$headerText.innerHTML };
    this.$headerRefId.style.display = 'none';
    let newBody = document.createElement('tbody');
    Object.keys(sdos).forEach(sdoName => {
      let pair = sdos[sdoName];
      let clause = pair.clause;
      let ids = pair.ids;
      let first = ids[0];
      let row = newBody.insertRow();
      let cell = row.insertCell();
      cell.innerHTML = clause;
      cell = row.insertCell();
      let html = '<a href="' + makeLinkToId(first) + '">' + sdoName + '</a>';
      for (let i = 1; i < ids.length; ++i) {
        html += ' (<a href="' + makeLinkToId(ids[i]) + '">' + (i + 1) + '</a>)';
      }
      cell.innerHTML = html;
    });
    this.$table.removeChild(this.$tableBody);
    this.$tableBody = newBody;
    this.$table.appendChild(this.$tableBody);
  },
};

let Toolbox = {
  init() {
    this.$outer = document.createElement('div');
    this.$outer.classList.add('toolbox-container');
    this.$container = document.createElement('div');
    this.$container.classList.add('toolbox');
    this.$outer.appendChild(this.$container);
    this.$permalink = document.createElement('a');
    this.$permalink.textContent = 'Permalink';
    this.$pinLink = document.createElement('a');
    this.$pinLink.textContent = 'Pin';
    this.$pinLink.setAttribute('href', '#');
    this.$pinLink.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      menu.togglePinEntry(this.entry.id);
      this.$pinLink.textContent = menu._pinnedIds[this.entry.id] ? 'Unpin' : 'Pin';
    });

    this.$refsLink = document.createElement('a');
    this.$refsLink.setAttribute('href', '#');
    this.$refsLink.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      referencePane.showReferencesFor(this.entry);
    });
    this.$container.appendChild(this.$permalink);
    this.$container.appendChild(this.$pinLink);
    this.$container.appendChild(this.$refsLink);
    document.body.appendChild(this.$outer);
  },

  activate(el, entry, target) {
    if (el === this._activeEl) return;
    sdoBox.deactivate();
    this.active = true;
    this.entry = entry;
    this.$pinLink.textContent = menu._pinnedIds[entry.id] ? 'Unpin' : 'Pin';
    this.$outer.classList.add('active');
    this.top = el.offsetTop - this.$outer.offsetHeight;
    this.left = el.offsetLeft - 10;
    this.$outer.setAttribute('style', 'left: ' + this.left + 'px; top: ' + this.top + 'px');
    this.updatePermalink();
    this.updateReferences();
    this._activeEl = el;
    if (this.top < document.body.scrollTop && el === target) {
      // don't scroll unless it's a small thing (< 200px)
      this.$outer.scrollIntoView();
    }
  },

  updatePermalink() {
    this.$permalink.setAttribute('href', makeLinkToId(this.entry.id));
  },

  updateReferences() {
    this.$refsLink.textContent = `References (${(this.entry.referencingIds || []).length})`;
  },

  activateIfMouseOver(e) {
    let ref = this.findReferenceUnder(e.target);
    if (ref && (!this.active || e.pageY > this._activeEl.offsetTop)) {
      let entry = menu.search.biblio.byId[ref.id];
      this.activate(ref.element, entry, e.target);
    } else if (
      this.active &&
      (e.pageY < this.top || e.pageY > this._activeEl.offsetTop + this._activeEl.offsetHeight)
    ) {
      this.deactivate();
    }
  },

  findReferenceUnder(el) {
    while (el) {
      let parent = el.parentNode;
      if (el.nodeName === 'EMU-RHS' || el.nodeName === 'EMU-PRODUCTION') {
        return null;
      }
      if (
        el.nodeName === 'H1' &&
        parent.nodeName.match(/EMU-CLAUSE|EMU-ANNEX|EMU-INTRO/) &&
        parent.id
      ) {
        return { element: el, id: parent.id };
      } else if (el.nodeName === 'EMU-NT') {
        if (
          parent.nodeName === 'EMU-PRODUCTION' &&
          parent.id &&
          parent.id[0] !== '_' &&
          parent.firstElementChild === el
        ) {
          // return the LHS non-terminal element
          return { element: el, id: parent.id };
        }
        return null;
      } else if (
        el.nodeName.match(/EMU-(?!CLAUSE|XREF|ANNEX|INTRO)|DFN/) &&
        el.id &&
        el.id[0] !== '_'
      ) {
        if (
          el.nodeName === 'EMU-FIGURE' ||
          el.nodeName === 'EMU-TABLE' ||
          el.nodeName === 'EMU-EXAMPLE'
        ) {
          // return the figcaption element
          return { element: el.children[0].children[0], id: el.id };
        } else {
          return { element: el, id: el.id };
        }
      }
      el = parent;
    }
  },

  deactivate() {
    this.$outer.classList.remove('active');
    this._activeEl = null;
    this.active = false;
  },
};

function sortByClauseNumber(clause1, clause2) {
  let c1c = clause1.number.split('.');
  let c2c = clause2.number.split('.');

  for (let i = 0; i < c1c.length; i++) {
    if (i >= c2c.length) {
      return 1;
    }

    let c1 = c1c[i];
    let c2 = c2c[i];
    let c1cn = Number(c1);
    let c2cn = Number(c2);

    if (Number.isNaN(c1cn) && Number.isNaN(c2cn)) {
      if (c1 > c2) {
        return 1;
      } else if (c1 < c2) {
        return -1;
      }
    } else if (!Number.isNaN(c1cn) && Number.isNaN(c2cn)) {
      return -1;
    } else if (Number.isNaN(c1cn) && !Number.isNaN(c2cn)) {
      return 1;
    } else if (c1cn > c2cn) {
      return 1;
    } else if (c1cn < c2cn) {
      return -1;
    }
  }

  if (c1c.length === c2c.length) {
    return 0;
  }
  return -1;
}

function makeLinkToId(id) {
  let hash = '#' + id;
  if (typeof idToSection === 'undefined' || !idToSection[id]) {
    return hash;
  }
  let targetSec = idToSection[id];
  return (targetSec === 'index' ? './' : targetSec + '.html') + hash;
}

function doShortcut(e) {
  if (!(e.target instanceof HTMLElement)) {
    return;
  }
  let target = e.target;
  let name = target.nodeName.toLowerCase();
  if (name === 'textarea' || name === 'input' || name === 'select' || target.isContentEditable) {
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) {
    return;
  }
  if (e.key === 'm' && usesMultipage) {
    let pathParts = location.pathname.split('/');
    let hash = location.hash;
    if (pathParts[pathParts.length - 2] === 'multipage') {
      if (hash === '') {
        let sectionName = pathParts[pathParts.length - 1];
        if (sectionName.endsWith('.html')) {
          sectionName = sectionName.slice(0, -5);
        }
        if (idToSection['sec-' + sectionName] !== undefined) {
          hash = '#sec-' + sectionName;
        }
      }
      location = pathParts.slice(0, -2).join('/') + '/' + hash;
    } else {
      location = 'multipage/' + hash;
    }
  } else if (e.key === 'u') {
    document.documentElement.classList.toggle('show-ao-annotations');
  } else if (e.key === '?') {
    document.getElementById('shortcuts-help').classList.toggle('active');
  }
}

function init() {
  menu = new Menu();
  let $container = document.getElementById('spec-container');
  $container.addEventListener(
    'mouseover',
    debounce(e => {
      Toolbox.activateIfMouseOver(e);
    })
  );
  document.addEventListener(
    'keydown',
    debounce(e => {
      if (e.code === 'Escape') {
        if (Toolbox.active) {
          Toolbox.deactivate();
        }
        document.getElementById('shortcuts-help').classList.remove('active');
      }
    })
  );
}

document.addEventListener('keypress', doShortcut);

document.addEventListener('DOMContentLoaded', () => {
  Toolbox.init();
  referencePane.init();
});

// preserve state during navigation

function getTocPath(li) {
  let path = [];
  let pointer = li;
  while (true) {
    let parent = pointer.parentElement;
    if (parent == null) {
      return null;
    }
    let index = [].indexOf.call(parent.children, pointer);
    if (index == -1) {
      return null;
    }
    path.unshift(index);
    pointer = parent.parentElement;
    if (pointer == null) {
      return null;
    }
    if (pointer.id === 'menu-toc') {
      break;
    }
    if (pointer.tagName !== 'LI') {
      return null;
    }
  }
  return path;
}

function activateTocPath(path) {
  try {
    let pointer = document.getElementById('menu-toc');
    for (let index of path) {
      pointer = pointer.querySelector('ol').children[index];
    }
    pointer.classList.add('active');
  } catch (e) {
    // pass
  }
}

function getActiveTocPaths() {
  return [...menu.$menu.querySelectorAll('.active')].map(getTocPath).filter(p => p != null);
}

function loadStateFromSessionStorage() {
  if (!window.sessionStorage || typeof menu === 'undefined' || window.navigating) {
    return;
  }
  if (sessionStorage.referencePaneState != null) {
    let state = JSON.parse(sessionStorage.referencePaneState);
    if (state != null) {
      if (state.type === 'ref') {
        let entry = menu.search.biblio.byId[state.id];
        if (entry != null) {
          referencePane.showReferencesFor(entry);
        }
      } else if (state.type === 'sdo') {
        let sdos = sdoMap[state.id];
        if (sdos != null) {
          referencePane.$headerText.innerHTML = state.html;
          referencePane.showSDOsBody(sdos, state.id);
        }
      }
      delete sessionStorage.referencePaneState;
    }
  }

  if (sessionStorage.activeTocPaths != null) {
    document
      .getElementById('menu-toc')
      .querySelectorAll('.active')
      .forEach(e => {
        e.classList.remove('active');
      });
    let active = JSON.parse(sessionStorage.activeTocPaths);
    active.forEach(activateTocPath);
    delete sessionStorage.activeTocPaths;
  }

  if (sessionStorage.searchValue != null) {
    let value = JSON.parse(sessionStorage.searchValue);
    menu.search.$searchBox.value = value;
    menu.search.search(value);
    delete sessionStorage.searchValue;
  }

  if (sessionStorage.tocScroll != null) {
    let tocScroll = JSON.parse(sessionStorage.tocScroll);
    menu.$toc.scrollTop = tocScroll;
    delete sessionStorage.tocScroll;
  }
}

document.addEventListener('DOMContentLoaded', loadStateFromSessionStorage);

window.addEventListener('pageshow', loadStateFromSessionStorage);

window.addEventListener('beforeunload', () => {
  if (!window.sessionStorage || typeof menu === 'undefined') {
    return;
  }
  sessionStorage.referencePaneState = JSON.stringify(referencePane.state || null);
  sessionStorage.activeTocPaths = JSON.stringify(getActiveTocPaths());
  sessionStorage.searchValue = JSON.stringify(menu.search.$searchBox.value);
  sessionStorage.tocScroll = JSON.stringify(menu.$toc.scrollTop);
});

'use strict';
let decimalBullet = Array.from({ length: 100 }, (a, i) => '' + (i + 1));
let alphaBullet = Array.from({ length: 26 }, (a, i) => String.fromCharCode('a'.charCodeAt(0) + i));

// prettier-ignore
let romanBullet = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx', 'xxi', 'xxii', 'xxiii', 'xxiv', 'xxv'];
// prettier-ignore
let bullets = [decimalBullet, alphaBullet, romanBullet, decimalBullet, alphaBullet, romanBullet];

function addStepNumberText(ol, parentIndex) {
  for (let i = 0; i < ol.children.length; ++i) {
    let child = ol.children[i];
    let index = parentIndex.concat([i]);
    let applicable = bullets[Math.min(index.length - 1, 5)];
    let span = document.createElement('span');
    span.textContent = (applicable[i] || '?') + '. ';
    span.style.fontSize = '0';
    span.setAttribute('aria-hidden', 'true');
    child.prepend(span);
    let sublist = child.querySelector('ol');
    if (sublist != null) {
      addStepNumberText(sublist, index);
    }
  }
}
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('emu-alg > ol').forEach(ol => {
    addStepNumberText(ol, []);
  });
});

let sdoMap = JSON.parse(`{"prod-FDwUUOp8":{"StringNumericValue":{"clause":"7.1.4.1.2","ids":["prod-_R4wE0aJ"]}},"prod-m-6uXikA":{"StringNumericValue":{"clause":"7.1.4.1.2","ids":["prod-meFGI9GM"]}},"prod-rEUJru-M":{"StringNumericValue":{"clause":"7.1.4.1.2","ids":["prod-chPZzOnl"]}},"prod-glMHXxnX":{"StringNumericValue":{"clause":"7.1.4.1.2","ids":["prod-gjHq7g3y"]}},"prod-QcF4NRmv":{"StringNumericValue":{"clause":"7.1.4.1.2","ids":["prod-rF3lJM39"]}},"prod-0clqUBRw":{"StringNumericValue":{"clause":"7.1.4.1.2","ids":["prod-rFHlF9yu"]}},"prod-h9Y6iP78":{"StringNumericValue":{"clause":"7.1.4.1.2","ids":["prod-KhQPr5RG"]}},"prod-14bLNUM8":{"StringNumericValue":{"clause":"7.1.4.1.2","ids":["prod-0Vf62eUX"]}},"prod-5vbjd2EY":{"BoundNames":{"clause":"8.2.1","ids":["prod-Yc3dQCIS"]},"BindingInitialization":{"clause":"8.6.2","ids":["prod-AUuPIcte"]},"Evaluation":{"clause":"14.7.5.8","ids":["prod-_anR-waH"]}},"prod-bP3zkqsh":{"BoundNames":{"clause":"8.2.1","ids":["prod-0oRvH9Oa"]},"BindingInitialization":{"clause":"8.6.2","ids":["prod-mvAZKdLR"]},"StringValue":{"clause":"13.1.2","ids":["prod-ZpP1WoNY"]},"Evaluation":{"clause":"14.7.5.8","ids":["prod-K8Yvyf4p"]}},"prod-k8G1I2qF":{"BoundNames":{"clause":"8.2.1","ids":["prod-eP6tRBFI"]},"BindingInitialization":{"clause":"8.6.2","ids":["prod-SuKbQr-p"]},"StringValue":{"clause":"13.1.2","ids":["prod-fu2iq4OH"]},"Evaluation":{"clause":"14.7.5.8","ids":["prod-KzQjZu5p"]}},"prod-10DUWE8d":{"BoundNames":{"clause":"8.2.1","ids":["prod-WhUrx1KG"]},"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-jGNpgH6g"]},"Evaluation":{"clause":"14.3.1.2","ids":["prod-dx4AGe8K"]}},"prod-FYQ2Ly4e":{"BoundNames":{"clause":"8.2.1","ids":["prod-pdmM8758"]},"Evaluation":{"clause":"14.3.1.2","ids":["prod-EyFo2V-D"]}},"prod-l3Hg2UJ0":{"BoundNames":{"clause":"8.2.1","ids":["prod-SIbbs3t0"]},"Evaluation":{"clause":"14.3.1.2","ids":["prod-mW_TWZBz","prod-gOqjOKq_"]}},"prod-FppJpMK8":{"BoundNames":{"clause":"8.2.1","ids":["prod-WfIK7IbR"]},"Evaluation":{"clause":"14.3.1.2","ids":["prod-HJPtX-Q7"]}},"prod-kqbqpKlK":{"BoundNames":{"clause":"8.2.1","ids":["prod-PvG06doO"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-HsuXutdb"]},"Evaluation":{"clause":"14.3.2.1","ids":["prod-mRNvbUb_"]}},"prod-IeHby7A3":{"BoundNames":{"clause":"8.2.1","ids":["prod-TRoL9A8A"]},"Evaluation":{"clause":"14.3.2.1","ids":["prod-DloKhDSp","prod-luUzRvcA"]}},"prod-MhsdViui":{"BoundNames":{"clause":"8.2.1","ids":["prod-uemJBnZk"]},"Evaluation":{"clause":"14.3.2.1","ids":["prod-615TDHeB"]}},"prod-Zq1KBCx2":{"BoundNames":{"clause":"8.2.1","ids":["prod-HmBRwRUL"]},"BindingInitialization":{"clause":"8.6.2","ids":["prod-lV7YKS21"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-zkT2lhLy"]}},"prod-ZImPf3XQ":{"BoundNames":{"clause":"8.2.1","ids":["prod-VrgiRc7B"]},"BindingInitialization":{"clause":"8.6.2","ids":["prod--Bap0q1J","prod-qC471RM1"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-wtzT9EiN"]}},"prod-GTLtfjt0":{"BoundNames":{"clause":"8.2.1","ids":["prod-e52_ta72","prod-gapTHhxd"]},"IteratorBindingInitialization":{"clause":"8.6.3","ids":["prod-tsjeAqRc","prod--IC6X92I","prod-NrdrIJZT"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-h16qYz6B","prod-1FzGu7Lp"]}},"prod-ZEEMEcAo":{"BoundNames":{"clause":"8.2.1","ids":["prod-uQApgi98","prod-UADb9W1C"]},"IteratorBindingInitialization":{"clause":"8.6.3","ids":["prod-KgRoomIq","prod-jvZ0PZvK"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-rkwjGbA6","prod-J6x8FZJI"]}},"prod-TkJ_upuv":{"BoundNames":{"clause":"8.2.1","ids":["prod-hRHC-ltw"]},"PropertyBindingInitialization":{"clause":"14.3.3.1","ids":["prod-jhtKd-Y5"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-OZ7bBYfO"]}},"prod-QAGJVJ9v":{"BoundNames":{"clause":"8.2.1","ids":["prod-HS4vlt-j"]},"IteratorBindingInitialization":{"clause":"8.6.3","ids":["prod-JkWX9ITf"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-Pbu7NeJV"]}},"prod-eAKFkNTn":{"BoundNames":{"clause":"8.2.1","ids":["prod-C9gIgbxU"]},"IteratorBindingInitialization":{"clause":"8.6.3","ids":["prod-mMA3BDq4"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-l7kFOPKe"]}},"prod-VmvTFDAY":{"BoundNames":{"clause":"8.2.1","ids":["prod-MJIzQe4_"]},"PropertyBindingInitialization":{"clause":"14.3.3.1","ids":["prod-1euONYQ-"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-eeXd9umu"]}},"prod-8lbkfoVZ":{"BoundNames":{"clause":"8.2.1","ids":["prod-T0DsYQHz"]},"IteratorBindingInitialization":{"clause":"8.6.3","ids":["prod-SVSt7_f4"]},"KeyedBindingInitialization":{"clause":"14.3.3.3","ids":["prod-v4J727kL"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-4G21hRBK","prod-8U9yuoPy"]},"IsSimpleParameterList":{"clause":"15.1.3","ids":["prod-0qUANoiw","prod-b6-qn4pg"]},"HasInitializer":{"clause":"15.1.4","ids":["prod-Qjr24iGe","prod-6kCXjXJH"]}},"prod-qY39_uPQ":{"BoundNames":{"clause":"8.2.1","ids":["prod-XX1yN-l7"]},"IteratorBindingInitialization":{"clause":"8.6.3","ids":["prod-m05a8O_b"]},"KeyedBindingInitialization":{"clause":"14.3.3.3","ids":["prod-kKvAd4Kx"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-1LlZEk6k"]},"IsSimpleParameterList":{"clause":"15.1.3","ids":["prod-iu5DldfN","prod-qrNno2ET"]},"HasInitializer":{"clause":"15.1.4","ids":["prod-HBo05lrR","prod-3n6oU9Uv"]}},"prod-ygJ0cdk1":{"BoundNames":{"clause":"8.2.1","ids":["prod-Wj-eaJJJ"]},"IsDestructuring":{"clause":"14.7.5.2","ids":["prod-gowHZDoa"]},"ForDeclarationBindingInitialization":{"clause":"14.7.5.3","ids":["prod-S5lZ05os"]},"ForDeclarationBindingInstantiation":{"clause":"14.7.5.4","ids":["prod-bTiDTykL"]}},"prod-lEQdX6hk":{"BoundNames":{"clause":"8.2.1","ids":["prod-AAggAe5k"]},"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-5tjiqCsV"]},"Contains":{"clause":"8.5.1","ids":["prod-JYruL-G6"]},"InstantiateFunctionObject":{"clause":"8.6.1","ids":["prod-mfAdULQi"]},"InstantiateOrdinaryFunctionObject":{"clause":"15.2.4","ids":["prod-oT86BVb2"]},"Evaluation":{"clause":"15.2.6","ids":["prod-JkNCEml2"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-cYRKXADu"]}},"prod-eqpHaG0r":{"BoundNames":{"clause":"8.2.1","ids":["prod-rmB8ZP2j"]},"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-Fqj8pzpb"]},"Contains":{"clause":"8.5.1","ids":["prod-RYB8pT4v"]},"InstantiateFunctionObject":{"clause":"8.6.1","ids":["prod-f7nt2HkW"]},"InstantiateOrdinaryFunctionObject":{"clause":"15.2.4","ids":["prod-TjR6TGOd"]},"Evaluation":{"clause":"15.2.6","ids":["prod-JB2pB6KU"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-fA8Y53Jv"]}},"prod-L6HGhDG8":{"BoundNames":{"clause":"8.2.1","ids":["prod-NuuiWZ7v"]},"IteratorBindingInitialization":{"clause":"8.6.3","ids":["prod-1uizUnEF"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-i4esWmfn"]},"IsSimpleParameterList":{"clause":"15.1.3","ids":["prod-tfjykC09"]},"ExpectedArgumentCount":{"clause":"15.1.5","ids":["prod-eE6gHDad"]}},"prod-aTWifksv":{"BoundNames":{"clause":"8.2.1","ids":["prod-po75ZBLy"]},"IteratorBindingInitialization":{"clause":"8.6.3","ids":["prod-uQ_NTpHd"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-ffwfOKFy"]},"IsSimpleParameterList":{"clause":"15.1.3","ids":["prod-90MekD57"]},"ExpectedArgumentCount":{"clause":"15.1.5","ids":["prod--tdGBtde"]}},"prod-7NFUmaIc":{"BoundNames":{"clause":"8.2.1","ids":["prod-dSRi9b3k"]},"IteratorBindingInitialization":{"clause":"8.6.3","ids":["prod-F7oEv_fM"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-Z488vACK"]},"IsSimpleParameterList":{"clause":"15.1.3","ids":["prod-CdQEr4_m"]},"HasInitializer":{"clause":"15.1.4","ids":["prod-YlncCUel"]},"ExpectedArgumentCount":{"clause":"15.1.5","ids":["prod-2HGoRaSl"]}},"prod-W9higncN":{"BoundNames":{"clause":"8.2.1","ids":["prod-B1jl1kwZ"]},"Contains":{"clause":"8.5.1","ids":["prod-CNqH7XEc"]},"IteratorBindingInitialization":{"clause":"8.6.3","ids":["prod-F51qoUgS"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-l6d_kFqp"]},"IsSimpleParameterList":{"clause":"15.1.3","ids":["prod-46y1StQq"]},"ExpectedArgumentCount":{"clause":"15.1.5","ids":["prod-2fYMCaig"]}},"prod-oJNsRhfl":{"BoundNames":{"clause":"8.2.1","ids":["prod-t6vQVPUG"]},"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-FmAf4OGl"]},"Contains":{"clause":"8.5.1","ids":["prod-YglW_lFm"]},"InstantiateFunctionObject":{"clause":"8.6.1","ids":["prod-BE72OMfT"]},"InstantiateGeneratorFunctionObject":{"clause":"15.5.3","ids":["prod-x_w-E_WI"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-Uf4haGDs"]}},"prod-bWfHg6Xe":{"BoundNames":{"clause":"8.2.1","ids":["prod-qJNJRowC"]},"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-2O3Y8NX3"]},"Contains":{"clause":"8.5.1","ids":["prod-hMB2st0D"]},"InstantiateFunctionObject":{"clause":"8.6.1","ids":["prod-9FriOUuY"]},"InstantiateGeneratorFunctionObject":{"clause":"15.5.3","ids":["prod-zyQVJwqE"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-7bSRnJkd"]}},"prod-cOKIJmRw":{"BoundNames":{"clause":"8.2.1","ids":["prod-D36uGDV1"]},"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-wRhLbuAn"]},"Contains":{"clause":"8.5.1","ids":["prod-ow6TXQ_a"]},"InstantiateFunctionObject":{"clause":"8.6.1","ids":["prod-MBXIRXX3"]},"InstantiateAsyncGeneratorFunctionObject":{"clause":"15.6.3","ids":["prod-JvNVLw_7"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-3lM6XkIw"]}},"prod-1L17zU6t":{"BoundNames":{"clause":"8.2.1","ids":["prod-Fiyc5-gj"]},"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-_1WUvl3J"]},"Contains":{"clause":"8.5.1","ids":["prod-lLs4pRL8"]},"InstantiateFunctionObject":{"clause":"8.6.1","ids":["prod-0BnnuWOV"]},"InstantiateAsyncGeneratorFunctionObject":{"clause":"15.6.3","ids":["prod-G-CKcSEp"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-w57asuPi"]}},"prod-kd27yk51":{"BoundNames":{"clause":"8.2.1","ids":["prod-_x3zvham"]},"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-J5Ultzy7"]},"BindingClassDeclarationEvaluation":{"clause":"15.7.15","ids":["prod-JmEOsNvO"]},"Evaluation":{"clause":"15.7.16","ids":["prod-P7ajQhl1"]}},"prod-bStNnwN_":{"BoundNames":{"clause":"8.2.1","ids":["prod-0u78ulHy"]},"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-v6ZGEAMc"]},"BindingClassDeclarationEvaluation":{"clause":"15.7.15","ids":["prod-qOUNT0OA"]}},"prod-iAuKx0s9":{"BoundNames":{"clause":"8.2.1","ids":["prod-G-h1FrC4"]},"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-w95osZOA"]},"Contains":{"clause":"8.5.1","ids":["prod-vPfDfZVz"]},"InstantiateFunctionObject":{"clause":"8.6.1","ids":["prod-cpVe0Sep"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-k_4DyjCo"]},"InstantiateAsyncFunctionObject":{"clause":"15.8.2","ids":["prod-VjNDNC25"]}},"prod-TaHP58mu":{"BoundNames":{"clause":"8.2.1","ids":["prod-NaC_U8xV"]},"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-6nHiQ-2B"]},"Contains":{"clause":"8.5.1","ids":["prod-PDvYlV0q"]},"InstantiateFunctionObject":{"clause":"8.6.1","ids":["prod-g0-rNkU8"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-TdFyphFg"]},"InstantiateAsyncFunctionObject":{"clause":"15.8.2","ids":["prod-QVYl6PrK"]}},"prod-HT-vtkeW":{"BoundNames":{"clause":"8.2.1","ids":["prod-kRyJKqmR"]},"IsSimpleParameterList":{"clause":"15.1.3","ids":["prod-bCpQszCG"]}},"prod-WzAgO-V_":{"BoundNames":{"clause":"8.2.1","ids":["prod-jZE2c8MZ"]},"ModuleRequests":{"clause":"16.2.1.3","ids":["prod-Fii3Jv-w"]},"ImportEntries":{"clause":"16.2.2.2","ids":["prod-4FL2ok6-"]}},"prod-CDGJVPkq":{"BoundNames":{"clause":"8.2.1","ids":["prod-me1fjwho"]},"ImportEntries":{"clause":"16.2.2.2","ids":["prod--ST7ch2j"]}},"prod-kEa0XgB6":{"BoundNames":{"clause":"8.2.1","ids":["prod-gnkPkMbr"]},"ImportEntriesForModule":{"clause":"16.2.2.3","ids":["prod-ejkMSdRd"]}},"prod-wyOKxI9w":{"BoundNames":{"clause":"8.2.1","ids":["prod-WTIt04mh"]},"ImportEntriesForModule":{"clause":"16.2.2.3","ids":["prod-0jSzNM4w"]}},"prod-SkqVKtrZ":{"BoundNames":{"clause":"8.2.1","ids":["prod-2q0gunUG"]},"ImportEntriesForModule":{"clause":"16.2.2.3","ids":["prod-Cg-QzVAj"]}},"prod-UCgvcMcb":{"BoundNames":{"clause":"8.2.1","ids":["prod-phtlO1Je"]},"ImportEntriesForModule":{"clause":"16.2.2.3","ids":["prod-nXrDLJR0"]}},"prod-7GW8ul0v":{"BoundNames":{"clause":"8.2.1","ids":["prod-4FuZGlZe"]},"ImportEntriesForModule":{"clause":"16.2.2.3","ids":["prod-iQJyYMlU"]}},"prod-xWvkB_EQ":{"BoundNames":{"clause":"8.2.1","ids":["prod-OyREyUBO"]},"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-w8mrwXF1"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-IxEr0QE9"]},"ModuleRequests":{"clause":"16.2.1.3","ids":["prod-ShgW98pi"]},"ExportedBindings":{"clause":"16.2.3.2","ids":["prod-V3c4HtRK"]},"ExportedNames":{"clause":"16.2.3.3","ids":["prod-Upv45R4X"]},"ExportEntries":{"clause":"16.2.3.4","ids":["prod-Pw78KQtD"]},"Evaluation":{"clause":"16.2.3.7","ids":["prod-7S1R-xaK"]}},"prod---2Mdo2Q":{"BoundNames":{"clause":"8.2.1","ids":["prod-sOWb3AM5"]},"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-mTdGbVUU"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-DEMJzdJ7"]},"ModuleRequests":{"clause":"16.2.1.3","ids":["prod-x1UQSoBl"]},"ExportedBindings":{"clause":"16.2.3.2","ids":["prod-OFghu2j_"]},"ExportEntries":{"clause":"16.2.3.4","ids":["prod-VQKcYkbx"]},"Evaluation":{"clause":"16.2.3.7","ids":["prod-HmLCnng_"]}},"prod-w_WAVAwX":{"BoundNames":{"clause":"8.2.1","ids":["prod-wpPb0--4"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-cMreMYU5"]},"ModuleRequests":{"clause":"16.2.1.3","ids":["prod-vvvIsXz5"]},"ExportedBindings":{"clause":"16.2.3.2","ids":["prod-IJxf-Cdm"]},"ExportedNames":{"clause":"16.2.3.3","ids":["prod-n6JkNQnf"]},"ExportEntries":{"clause":"16.2.3.4","ids":["prod-vHJuGFG0"]},"Evaluation":{"clause":"16.2.3.7","ids":["prod-qMwuQwD4"]}},"prod-60Xh0dpZ":{"BoundNames":{"clause":"8.2.1","ids":["prod-yl8Kvf8S"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-xsgJyOoQ"]},"ModuleRequests":{"clause":"16.2.1.3","ids":["prod-GV0VESxu"]},"ExportedBindings":{"clause":"16.2.3.2","ids":["prod-PahxJv8L"]},"ExportedNames":{"clause":"16.2.3.3","ids":["prod-NjdAgwQZ"]},"ExportEntries":{"clause":"16.2.3.4","ids":["prod-7BCAocpR"]},"Evaluation":{"clause":"16.2.3.7","ids":["prod-RU5ba9t5"]}},"prod-bE4rfMak":{"BoundNames":{"clause":"8.2.1","ids":["prod-oqm8ado6"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-cRTDqnfl"]},"ModuleRequests":{"clause":"16.2.1.3","ids":["prod-VYqY45eE"]},"ExportedBindings":{"clause":"16.2.3.2","ids":["prod-Ltk1AbDn"]},"ExportedNames":{"clause":"16.2.3.3","ids":["prod-iOoR-XLv"]},"ExportEntries":{"clause":"16.2.3.4","ids":["prod-rg_YnEcS"]},"Evaluation":{"clause":"16.2.3.7","ids":["prod-7GDTz4eH"]}},"prod-KPFnW3Lq":{"BoundNames":{"clause":"8.2.1","ids":["prod-pmSnaEkm"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-4yMGuqEs"]},"ModuleRequests":{"clause":"16.2.1.3","ids":["prod-bcC47tAa"]},"ExportedBindings":{"clause":"16.2.3.2","ids":["prod-kSrXZybF"]},"ExportedNames":{"clause":"16.2.3.3","ids":["prod-BuNuTBV9"]},"ExportEntries":{"clause":"16.2.3.4","ids":["prod-A54_tyTm"]},"Evaluation":{"clause":"16.2.3.7","ids":["prod-963jyNzQ"]}},"prod-GUPXSqcT":{"BoundNames":{"clause":"8.2.1","ids":["prod-fy8WSBrE"]},"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-K87ApD92"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-XTfiw-G1"]},"ModuleRequests":{"clause":"16.2.1.3","ids":["prod-GGFgV72D"]},"ExportedBindings":{"clause":"16.2.3.2","ids":["prod-tftEFTtX"]},"ExportedNames":{"clause":"16.2.3.3","ids":["prod-fWfjxGVB"]},"ExportEntries":{"clause":"16.2.3.4","ids":["prod-04PQQ9j2"]},"Evaluation":{"clause":"16.2.3.7","ids":["prod-KpBQ_5fa"]}},"prod-xo77HsL9":{"DeclarationPart":{"clause":"8.2.2","ids":["prod-g7IOVGn1"]},"Evaluation":{"clause":"14.1.1","ids":["prod-80Y3L4PZ"]}},"prod-dpslEYBS":{"DeclarationPart":{"clause":"8.2.2","ids":["prod-sN7udk5J"]},"Evaluation":{"clause":"14.1.1","ids":["prod-F2xRdnbO"]}},"prod-InkDjQLb":{"DeclarationPart":{"clause":"8.2.2","ids":["prod-jjBSfSof"]},"Evaluation":{"clause":"14.1.1","ids":["prod-19_kIcSj"]}},"prod-OBGQy9cZ":{"DeclarationPart":{"clause":"8.2.2","ids":["prod-KvSTEPI7"]},"Evaluation":{"clause":"14.1.1","ids":["prod-AdaKcE7P"]}},"prod-o4HYrPz3":{"DeclarationPart":{"clause":"8.2.2","ids":["prod-kBBrFjaX"]}},"prod-9H9FGeT7":{"DeclarationPart":{"clause":"8.2.2","ids":["prod-GAkiMJN6"]}},"prod-7oqY0VPN":{"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-Iol_vN-I"]}},"prod-rTRI6GVQ":{"IsConstantDeclaration":{"clause":"8.2.3","ids":["prod-xwFhJZXb"]}},"prod-30nvN6ck":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-mPEvRR9d"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-4f3fXSme"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod--ycd0kFi"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-SpvJf5dZ"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-YsZID3li"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-eptReca1"]},"Evaluation":{"clause":"14.2.2","ids":["prod-GN03td2O","prod-CUMWT9xI"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-XaV9YBUk"]}},"prod--OFVjnjw":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-ZFtxhsq0"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-dqBS0eQw"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-ikslLJyV"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-r8z3UV58"]},"TopLevelLexicallyDeclaredNames":{"clause":"8.2.8","ids":["prod-s6Vb3QUL"]},"TopLevelLexicallyScopedDeclarations":{"clause":"8.2.9","ids":["prod-fSl8sbck"]},"TopLevelVarDeclaredNames":{"clause":"8.2.10","ids":["prod-_Kx3fMtB"]},"TopLevelVarScopedDeclarations":{"clause":"8.2.11","ids":["prod-MxUpZ-t-"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-IG220ePF"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-v3tH_xWo"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-Vrq9L4TL"]},"Evaluation":{"clause":"14.2.2","ids":["prod-qY9k7-Mq"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-F5ertWhw"]}},"prod-GHY4Vd3_":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-Rrf-OST4"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-MlufDCPG"]},"TopLevelLexicallyDeclaredNames":{"clause":"8.2.8","ids":["prod-DWksqgz-"]},"TopLevelLexicallyScopedDeclarations":{"clause":"8.2.9","ids":["prod-68OgfJw9"]},"TopLevelVarDeclaredNames":{"clause":"8.2.10","ids":["prod-CxIyq9Kn"]},"TopLevelVarScopedDeclarations":{"clause":"8.2.11","ids":["prod-wmlLZdyg"]}},"prod-yYByJL6Z":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-9AEMspNg"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-IYBZJ2CF"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-mb72lTih"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-zHpAsUUQ"]},"TopLevelLexicallyDeclaredNames":{"clause":"8.2.8","ids":["prod-ReRATT6e"]},"TopLevelLexicallyScopedDeclarations":{"clause":"8.2.9","ids":["prod--BAI6AhR"]},"TopLevelVarDeclaredNames":{"clause":"8.2.10","ids":["prod-l-2kGEcB"]},"TopLevelVarScopedDeclarations":{"clause":"8.2.11","ids":["prod-OvMm0IpZ"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-RfvwtRC6"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-H7TPYpiU"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-0U13tcP4"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-pXbgumyQ"]}},"prod-q66ZlOHI":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod--_BgAjEq"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-bhogjJ1W"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-DTgBd2wQ"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-BX82yRxg"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-8Uz0YNaN"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-MxUCmZej"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-wESl6-va"]},"CaseBlockEvaluation":{"clause":"14.12.2","ids":["prod--oXyocga","prod-n6COrqbY"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-xbbhi7s4"]}},"prod-JuWwIrcZ":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-mSnfTK7z"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-am_Z4H66"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-e2BPI-N_"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-aW8QiumN"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-UcaBQzki"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-a3dtTxDp"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-L1SF9WLb"]},"CaseBlockEvaluation":{"clause":"14.12.2","ids":["prod-bc5B_Aaw"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-qQu0U2NT"]}},"prod-sjZo1Z65":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-7Gkp_Ikd"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-LxvbRJKF"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-_zisH9m7"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-nuKGUlOU"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-yJHneCFO"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-mWAyGNz1"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-Mf-FlzJR"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-NriAn6Ov"]}},"prod-A-5Q_6I5":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-LyDmmUT5"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-tORmzQQv"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-Gdv5Uzyo"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-mzP2If-y"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-YbPvJc_D"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-xKDcEL_e"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-YLBmIA_U"]},"Evaluation":{"clause":"14.12.4","ids":["prod-pfa8PeiE","prod-SiRXsnRx"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-E0jD9ho5"]}},"prod-HPF3iA_C":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-JWPhP_ev"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-84xBBiJA"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-ocDhl-eB"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-ZPHZRUV6"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-__iQJPEb"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-WyF-LUeK"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-ycWJ_ozd"]},"Evaluation":{"clause":"14.12.4","ids":["prod-f0Rq5Irs","prod-eOryVE-Y"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-VmaCE56t"]}},"prod-0GG8m5VC":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-BptUBlCG"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-V7zVpmtw"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-xypmC2Rc"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-i-A4iWeY"]},"TopLevelVarDeclaredNames":{"clause":"8.2.10","ids":["prod-gviukyGv"]},"TopLevelVarScopedDeclarations":{"clause":"8.2.11","ids":["prod-sPvwm3DB"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-UiQoMdIo"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-zsR5iLZH"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-8au0KFQe"]},"Evaluation":{"clause":"14.13.3","ids":["prod-z6MMrwO3"]},"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-GnWrgP5w"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-EJFE0gRP"]}},"prod-YaWmIZ1c":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-FwgSl19M"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-3Vc5meav"]},"TopLevelVarDeclaredNames":{"clause":"8.2.10","ids":["prod-jtk1iKc9"]},"TopLevelVarScopedDeclarations":{"clause":"8.2.11","ids":["prod-h55yOiCC"]}},"prod-GPTeOVBJ":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-_jhHTL9Z"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-nL_6JlM9"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-TKnUh23n"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-ntkJlgei"]},"TopLevelVarDeclaredNames":{"clause":"8.2.10","ids":["prod-5RFYGz0t"]},"TopLevelVarScopedDeclarations":{"clause":"8.2.11","ids":["prod-aZ77pE36"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-j-zK1vJK"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-Mu3VhVjD"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-I9dzHyBf"]},"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-3whCJM4e"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-vYyfX_-t"]}},"prod-WeOYFNsx":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-8YrmfaA1","prod-yRWpcHmG"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-gtaAB-x7","prod-aKFk9Ijn"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-ic6_wi6x","prod-Fovz-BpD"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-vvqmH-2l","prod-x8eD4P1T"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-cn79vCHf"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-fN52Tgzf"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-zb1__ND8"]},"Evaluation":{"clause":"15.2.6","ids":["prod-TAJ7Z-Ln"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-kIL-80Vx"]}},"prod-uVY-nrQL":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod--e9cHzAJ","prod-o7NmaBd_"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-8GIOVjs9","prod-kKBABX1R"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-JPGgU11H","prod-ZZJ4np60"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-p7Y_jFE0","prod-o66wZ98a"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-_uXGEqKw"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-vh6EF-BV"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-7jAHsc96"]},"Evaluation":{"clause":"15.7.16","ids":["prod-sVEE0xLy"]}},"prod-UOsd7muB":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-2xZloP4O"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-4B0l6Nwq"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-kKbHUs1e"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-UWG_9qGM"]},"EvaluateBody":{"clause":"10.2.1.3","ids":["prod-ph5_rCcA"]},"ConciseBodyContainsUseStrict":{"clause":"15.3.2","ids":["prod-paSxtgKv"]},"EvaluateConciseBody":{"clause":"15.3.3","ids":["prod-WWzcef1e"]}},"prod-Dfs5WPuP":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-tdMR5_9c"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-0qrVz5hX"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-IDrLWHWU"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-VllrABp8"]},"EvaluateBody":{"clause":"10.2.1.3","ids":["prod--uh40sBe"]},"AsyncConciseBodyContainsUseStrict":{"clause":"15.9.2","ids":["prod-ua51hPgJ"]},"EvaluateAsyncConciseBody":{"clause":"15.9.3","ids":["prod-NeT6IfHf"]}},"prod-JhWenwzh":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-pGIh8pZc"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-h6iH_dVj"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-AiQH2RJz"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-se4Mco-N"]},"IsStrict":{"clause":"16.1.2","ids":["prod-ATUJl4Kq"]},"Evaluation":{"clause":"16.1.3","ids":["prod-L8JYzsWQ"]}},"prod-0cNJefq0":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-m6bh3GpA"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-1WkoNRM_"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-_GPKA3Cb"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-MCeJZE_U"]}},"prod-GXF21Ewo":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-t-OtLQL7"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-rZF3AogZ"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-WMKjW5iz"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-oVpqQZka"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-FlDPQVjo"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-gDhjMfCK"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-9GocAvXy"]},"ModuleRequests":{"clause":"16.2.1.3","ids":["prod-9OD1gHQa"]},"Evaluation":{"clause":"16.2.1.11","ids":["prod-a5nZ7X_y"]},"ImportEntries":{"clause":"16.2.2.2","ids":["prod-8cqfbQ1C"]},"ExportedBindings":{"clause":"16.2.3.2","ids":["prod-hxF0P9sA"]},"ExportedNames":{"clause":"16.2.3.3","ids":["prod-Td0h-qi5"]},"ExportEntries":{"clause":"16.2.3.4","ids":["prod-paVpIqc4"]}},"prod-E3Y7C_Ei":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-vXiSx9wh"]},"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-zqmuSkfM"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-lGybrnks"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-TBDbISuB"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-2RINFrzE"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-vD2SO16F"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-wlyNoKqz"]},"Evaluation":{"clause":"16.2.1.11","ids":["prod-45q8t20X"]},"ExportedBindings":{"clause":"16.2.3.2","ids":["prod-6U1eQAFM"]},"ExportedNames":{"clause":"16.2.3.3","ids":["prod-Nqbdsw0J"]},"ExportEntries":{"clause":"16.2.3.4","ids":["prod-AebNVOm2"]}},"prod-IobLK26D":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-v-PqD2SJ"]},"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-5uRXjJj7"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-f75VYPkN"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-OfzEYjJ0"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-UZaVgIpu"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-35aTaLbx"]},"ImportEntries":{"clause":"16.2.2.2","ids":["prod-qEXtoziY"]},"ExportedNames":{"clause":"16.2.3.3","ids":["prod-ebSwvFft"]}},"prod-hV3VZEve":{"LexicallyDeclaredNames":{"clause":"8.2.4","ids":["prod-XYalkd2A"]},"ModuleRequests":{"clause":"16.2.1.3","ids":["prod-pGkooQP4"]},"ImportEntries":{"clause":"16.2.2.2","ids":["prod-myYDa7qJ"]},"ExportedBindings":{"clause":"16.2.3.2","ids":["prod-KKQ0xR-v"]},"ExportedNames":{"clause":"16.2.3.3","ids":["prod-fa0LziO_"]},"ExportEntries":{"clause":"16.2.3.4","ids":["prod-K7CKbuyc"]}},"prod-7jzzWh1g":{"LexicallyScopedDeclarations":{"clause":"8.2.5","ids":["prod-eWnfpwM7"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-g_wYfia1"]},"ModuleRequests":{"clause":"16.2.1.3","ids":["prod-KwkKYyRj"]},"Evaluation":{"clause":"16.2.1.11","ids":["prod-950spMs_"]},"ImportEntries":{"clause":"16.2.2.2","ids":["prod-65kV3a3C"]},"ExportEntries":{"clause":"16.2.3.4","ids":["prod-VtH9KIhP"]}},"prod-YqiTL09y":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-VNDj7eNH"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-okevSHKw"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-7RdLi7r5"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-pHNPZODp"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-THlI2H2M"]},"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-qI_HU3XB"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-6SIyyGLy"]}},"prod-WCz7iwtm":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-wphgHlIl"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-TqyazVUw"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-9i0SR5pB"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-vqweAXZW"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-j74v1E9Q"]},"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-aRwgRfmk"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-J7MnLCgE"]}},"prod-Ro8XgDsH":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-UQCGQIDW"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-a_WX9dEz"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-kHTlCj8Z"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-u--VfnyG"]},"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-4r9ecQgz"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-ptINeFLS"]}},"prod-Rrel7YUC":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-5RADtbhJ"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-fC7m7rts"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-AQXoKs3Y"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-S4TJmj3I"]},"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-VyFRxEGQ"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-g-hVFlsz"]}},"prod-twdIgE_o":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-bxCHO4hn"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-ycPQZtUX"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-g3BkTc0o"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-Mk4OiTQ0"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-gDEZkDbt"]},"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-Hgg1wqRZ"]}},"prod-GHPcIp4f":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-GyFO-xRG"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-GTe_HlKz"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-GecuZ1YX"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-_wHAxVWB"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-uTECl_Vq"]},"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-q_qjzdry"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-5GevwvIH"]}},"prod-bDeNjo3k":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-HxLIoVCC"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-Pc-OKRR8"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-QFpbuk2C"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-zv1CKK_U"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-NBG_pA-N"]},"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-O3yX8Gg7"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-h7wdVS_8"]}},"prod-03w8p9mr":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-_o07UyGN"]},"Evaluation":{"clause":"14.3.2.1","ids":["prod-3b9-3HdT"]}},"prod-_lf1EvXT":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-5Ab4YMrd"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-B7KHfByo"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-iIi7e4Mv"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-OZMT2LO1"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-MYTRO2yV"]},"Evaluation":{"clause":"14.6.2","ids":["prod-V-mFBCSX"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-Ko_HI6eh"]}},"prod--e2u-nCd":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-Jj9iNkQT"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-yyIeKAQ3"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-M7d89bkQ"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-kiVPWNCJ"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-idT2m0fR"]},"Evaluation":{"clause":"14.6.2","ids":["prod-31mgDA5h"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-y6CLSCid"]}},"prod-9vnoeXX4":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-MQNHAeo7"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-QkEPe1CC"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-CSwsyonC"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-JiuempzE"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-1k-PvIQ6"]},"DoWhileLoopEvaluation":{"clause":"14.7.2.2","ids":["prod-3uzJdijq"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-S9zGaOvQ"]}},"prod-Tx40AFG0":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-6MiGg7LY"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-jrq4eHFJ"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-UWs53aWN"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-NfepJ8d-"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-nqE7jDen"]},"WhileLoopEvaluation":{"clause":"14.7.3.2","ids":["prod-0mdwhc7l"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-w8fD4eQR"]}},"prod-NvPgd2yM":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-22bMsY8a"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-5lKKTAkN"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-GgLrXaaO"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-_bYykgU2"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-sdOZ0OVe"]},"ForLoopEvaluation":{"clause":"14.7.4.2","ids":["prod-qUCVnDNm"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-5zL2KF3R"]}},"prod-pYXfSJG_":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-iNfrCk_F"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-13ohOiCm"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-di1-cm7_"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-0RGYYYa8"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-38R1spHk"]},"ForLoopEvaluation":{"clause":"14.7.4.2","ids":["prod-HwfL-Win"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-NaXtYhbG"]}},"prod-0Y0bZAvD":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-N2GkbzwH"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-eqKiNSk1"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-zOnkGPoB"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-gRSHgUm2"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-GQ9tF3ug"]},"ForLoopEvaluation":{"clause":"14.7.4.2","ids":["prod-PMtIFugG"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-dAMDtYUP"]}},"prod-Za8VIr4f":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-polenv5I"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-KgxDtGf4"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-rNKuYq6q"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-mui4tXHs"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-ilROtw6r"]},"ForInOfLoopEvaluation":{"clause":"14.7.5.5","ids":["prod-dhS3iRZF"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-bQapuc86"]}},"prod-xutvwaXc":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-cQmWs6F4"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-AWnFzjE8"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-zBPUdTbl"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-xkRBC0p_"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-mKAcS051"]},"ForInOfLoopEvaluation":{"clause":"14.7.5.5","ids":["prod-zcGoySgU"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-1PyeafOE"]}},"prod-nLtPS4oB":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-6rXrz7RR"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-5TY9-yea"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-zoCqTANq"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-3FISwBIz"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-MPaED8xy"]},"ForInOfLoopEvaluation":{"clause":"14.7.5.5","ids":["prod-xXfkt6k0"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-UxPxs8d_"]}},"prod-EoyoF5LI":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-LH0otfP0"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-t9Ps-Sf3"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-dRwtb2-L"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-0EPuBRtw"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-G_08fu0g"]},"ForInOfLoopEvaluation":{"clause":"14.7.5.5","ids":["prod-OIo-GNlm"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-wCPQQMFx"]}},"prod-ReDwT2-b":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-UE8msfiB"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-IEEeV8La"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-kCZrLuMF"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-bxXqpHGf"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-xuMzWdW7"]},"ForInOfLoopEvaluation":{"clause":"14.7.5.5","ids":["prod-Z4scLosS"]}},"prod-jY1gwM9V":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-Xl42xW5D"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-WOgH08rb"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-SKvXy5l6"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-eDdhr4db"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-Ii0_W2zX"]},"ForInOfLoopEvaluation":{"clause":"14.7.5.5","ids":["prod-KdWnMB6i"]}},"prod-_N8Q-kim":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-eiN5tOgj"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-SyVO6l8T"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-jKYdRg__"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-tYmMbbAK"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-RXKTOvxD"]},"ForInOfLoopEvaluation":{"clause":"14.7.5.5","ids":["prod-A6rVBZNm"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-MjZJhgTY"]}},"prod-M1zjKbr6":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-dkeW5WMH"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-o2HaUKnD"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-zqf8dZti"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-3UTSN7Q_"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-SLsBgk8L"]},"ForInOfLoopEvaluation":{"clause":"14.7.5.5","ids":["prod-pPrWP7Ph"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-SXpahyTC"]}},"prod-ut_uoPzp":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-dXd3oD1j"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-kZcYMT8d"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-1mQl-EgZ"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-DVohExfz"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-xVs7Y4Vv"]},"ForInOfLoopEvaluation":{"clause":"14.7.5.5","ids":["prod-5PDN6AV3"]}},"prod-3HlNX-pI":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-kf6BzwpI"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-otI6GMSS"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-92qu0ILT"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-wq9kNHey"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-qti0YV4g"]},"Evaluation":{"clause":"14.11.2","ids":["prod-OowrNhmq"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-CNjVnvTr"]}},"prod-3xRnqKfC":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-lB_U5kUv"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-FjNXiCI7"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-OMSfPp_0"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-zEFnXzdo"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-yGASkGus"]},"Evaluation":{"clause":"14.12.4","ids":["prod-raA0Z_ll"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-5fN7_rAP"]}},"prod-wD-TPYub":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-K6wLfAiN"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-RhYCwWQZ"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-iFqlj7Lz"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-Yr89pOXp"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-bHqvfllk"]},"Evaluation":{"clause":"14.15.3","ids":["prod-TjGqXGk4"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-osswrj81"]}},"prod-EYIEedje":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-naQihl7z"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-0GInHInm"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-DkNjzLGB"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-3_4iLynl"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-MPDlN7RI"]},"Evaluation":{"clause":"14.15.3","ids":["prod-BNnGZMkj"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-Gpv9b_Iv"]}},"prod-cfkI0NCS":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-F1kslF5t"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-pi8GJ951"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-Aa8IOm4z"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-KaiFSIRm"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-fYVcY74b"]},"Evaluation":{"clause":"14.15.3","ids":["prod-fUrDxi55"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-fwryg5gk"]}},"prod-IbvHsEaf":{"VarDeclaredNames":{"clause":"8.2.6","ids":["prod-1jr14zqX"]},"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-H8Sf_rsN"]},"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-K0PcnMLw"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-_CFhQEhr"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-WfIkG4rU"]},"CatchClauseEvaluation":{"clause":"14.15.2","ids":["prod-tivA4mFO"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-WuWbjiYu"]}},"prod-bXRN6REu":{"VarScopedDeclarations":{"clause":"8.2.7","ids":["prod-r4VwMPwM"]}},"prod-PfH00D1w":{"ContainsDuplicateLabels":{"clause":"8.3.1","ids":["prod-4jLROMWA"]},"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-KN2F74JM"]},"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-zeOghq31"]},"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-Ebz5cXwH"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-lv2KeoQI"]}},"prod-Jyx4vreG":{"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-YN_w7WcD"]},"Evaluation":{"clause":"14.9.2","ids":["prod-0ioO2qvc"]}},"prod-_aoH2Ltk":{"ContainsUndefinedBreakTarget":{"clause":"8.3.2","ids":["prod-sVlKX7KO"]},"Evaluation":{"clause":"14.9.2","ids":["prod-eokV1qEw"]}},"prod-c1cDILr5":{"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-q91g2YEq"]},"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-yFnpxPRG"]}},"prod-IZrgrSFg":{"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-PptGj0zd"]},"Evaluation":{"clause":"14.1.1","ids":["prod-FFjrmEWz"]},"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-pR7DNQsN"]}},"prod-rfM2mnQY":{"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-P3ParQAP"]},"Evaluation":{"clause":"14.8.2","ids":["prod-MdaDQGie"]}},"prod-w6m19zWs":{"ContainsUndefinedContinueTarget":{"clause":"8.3.3","ids":["prod-ngwxJt1P"]},"Evaluation":{"clause":"14.8.2","ids":["prod-sLmRG5Rx"]}},"prod-INZ21P3A":{"HasName":{"clause":"8.4.1","ids":["prod-sGIyUYN_"]},"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-Xr5TwVeJ"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-IZ2iaC5Z"]},"NamedEvaluation":{"clause":"8.4.5","ids":["prod-mytcbPJI"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-SPo4SV-C"]},"Evaluation":{"clause":"13.2.9.2","ids":["prod-U7_IxrKv"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-pxpI2tU_"]}},"prod--zvLR38c":{"HasName":{"clause":"8.4.1","ids":["prod-lYeq4upI","prod-M26qeGCy"]},"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-ZCX-L7VJ"]},"NamedEvaluation":{"clause":"8.4.5","ids":["prod-pLzR2hGq"]},"Contains":{"clause":"8.5.1","ids":["prod-Jc3hxjyv"]},"InstantiateOrdinaryFunctionExpression":{"clause":"15.2.5","ids":["prod-M2Odxhb_","prod-ZT_oXgSx"]},"Evaluation":{"clause":"15.2.6","ids":["prod-gx42gzY4"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-DKZGJMJp"]}},"prod-haubt72j":{"HasName":{"clause":"8.4.1","ids":["prod-yNYR71Xj","prod-_5BKcJSD"]},"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-mP4b69Ye"]},"NamedEvaluation":{"clause":"8.4.5","ids":["prod--NqycDNV"]},"Contains":{"clause":"8.5.1","ids":["prod-5B9biisJ"]},"InstantiateGeneratorFunctionExpression":{"clause":"15.5.4","ids":["prod-FnOrbSnb","prod-sxTe1ywL"]},"Evaluation":{"clause":"15.5.5","ids":["prod-yHj7yISB"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-RyrSiZbO"]}},"prod-s18yr2Ij":{"HasName":{"clause":"8.4.1","ids":["prod--vrKJ_CQ","prod-2Vz4PDlE"]},"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-o3PaoPru"]},"NamedEvaluation":{"clause":"8.4.5","ids":["prod-2hHyfg58"]},"Contains":{"clause":"8.5.1","ids":["prod-_doZ_xN0"]},"InstantiateAsyncGeneratorFunctionExpression":{"clause":"15.6.4","ids":["prod-A3m5kV04","prod-7PTlQqLp"]},"Evaluation":{"clause":"15.6.5","ids":["prod-RTtPBoTs"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-H3uNNgf7"]}},"prod-LFCRNt3l":{"HasName":{"clause":"8.4.1","ids":["prod-8SfxZRyk","prod-OXrRSTMk"]},"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-3ftZlYCP"]},"NamedEvaluation":{"clause":"8.4.5","ids":["prod-WZTY8BeC"]},"Contains":{"clause":"8.5.1","ids":["prod-0p21L8en"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-nEJuWHii"]},"InstantiateAsyncFunctionExpression":{"clause":"15.8.3","ids":["prod-3RN98Vrc","prod-iEhgnbem"]},"Evaluation":{"clause":"15.8.5","ids":["prod-o1t7r8mz"]}},"prod-AtXUMYu3":{"HasName":{"clause":"8.4.1","ids":["prod-yzK8_iQh"]},"NamedEvaluation":{"clause":"8.4.5","ids":["prod-2_XE6Qur"]},"Contains":{"clause":"8.5.1","ids":["prod-o1L20JNH"]},"InstantiateArrowFunctionExpression":{"clause":"15.3.4","ids":["prod-C8uAwDLj"]},"Evaluation":{"clause":"15.3.5","ids":["prod-_r8vevEJ"]}},"prod-YIoJOc1p":{"HasName":{"clause":"8.4.1","ids":["prod-WTqF0fRI"]},"NamedEvaluation":{"clause":"8.4.5","ids":["prod-acGpB7So"]},"Contains":{"clause":"8.5.1","ids":["prod-hmHHRRG6"]},"InstantiateAsyncArrowFunctionExpression":{"clause":"15.9.4","ids":["prod-kBFLOl9Q"]},"Evaluation":{"clause":"15.9.5","ids":["prod---LSw2Ps"]}},"prod-WTX_aban":{"HasName":{"clause":"8.4.1","ids":["prod-Wvi-SSNj"]},"NamedEvaluation":{"clause":"8.4.5","ids":["prod-AntIZd-c"]},"Contains":{"clause":"8.5.1","ids":["prod-0dGKszgN"]},"InstantiateAsyncArrowFunctionExpression":{"clause":"15.9.4","ids":["prod-YQv2CZBp"]},"Evaluation":{"clause":"15.9.5","ids":["prod-vJszVz5M"]}},"prod-Vthx67sj":{"HasName":{"clause":"8.4.1","ids":["prod-_uck0Y8U","prod-IuRXWsQe"]},"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-nQpbEu0v"]},"NamedEvaluation":{"clause":"8.4.5","ids":["prod-_NxRxZOJ"]},"Evaluation":{"clause":"15.7.16","ids":["prod-lm9h8Kwa","prod-l8XcpxuG"]}},"prod-6iVAqhjf":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-ujSQZu1u"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-Gs-T8p-O"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod--qvqF1RP"]},"Evaluation":{"clause":"13.2.1.1","ids":["prod-P91j5SRi"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-9Nj5RIni"]}},"prod-Qw-BmNvs":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-uqXksnK9"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-ztGhnTck"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-_yZN8EJG"]}},"prod-Sla8Mecg":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-xZz3xGrw"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-ICT5lo9j"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-jrxTmiG4"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-49th_4jp"]}},"prod-Caejwk3t":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-uQZUJPuk"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-8G12k2a3"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-oEnyQ_d5"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-VCC2b-df"]}},"prod-4t3kIOlY":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-YSIQyJy2"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-EUf92hO8"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-Lwy-qADd"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-57nYHC9R"]}},"prod-rfJuuLNW":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-xClvmJ_T"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-jU920ZeK"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-JA5CM-VG"]},"Evaluation":{"clause":"13.2.7.3","ids":["prod-J9TItKDI"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-iAVN3dH2"]}},"prod-iJnRUrcY":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-yobd7pAZ"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-5DrGbLLP"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-SNIQNUuy"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-uEE3vhkY"]}},"prod-IScPEVPu":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-z2eYriJH"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod--KgzMgsO"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-Z77CzX6A"]},"Evaluation":{"clause":"13.3.2.1","ids":["prod-3HizunKA"]},"IsDestructuring":{"clause":"14.7.5.2","ids":["prod-nfrnC2qv"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-O9zU8IeQ"]}},"prod-BTxM7XK0":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-v71UqLpH"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-CwZtsPgL"]},"Contains":{"clause":"8.5.1","ids":["prod-mlsPerHg"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-fBP_qjj3"]},"Evaluation":{"clause":"13.3.2.1","ids":["prod-BG7ZKp5h"]},"IsDestructuring":{"clause":"14.7.5.2","ids":["prod-pVCOt4bB"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-pLKWI9AB"]}},"prod-hF7lIb25":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-mDSr9u1p"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-MPSxl2zi"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-A3Jt723U"]},"Evaluation":{"clause":"13.3.11.1","ids":["prod-ZiK0MveV"]},"IsDestructuring":{"clause":"14.7.5.2","ids":["prod-IOJOqU1K"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-o5ILpQ4m"]}},"prod-gkYgn85G":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-JqMmNc5v"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-9f3rqn9l"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-Y1Rqw5E8"]},"IsDestructuring":{"clause":"14.7.5.2","ids":["prod-e3LgGUUv"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-hqYKqnVA"]}},"prod-EZ2BF6v8":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-0UkusR6o"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-1g-ib9lg"]},"IsDestructuring":{"clause":"14.7.5.2","ids":["prod-uCaMN-Ha"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-wTfT9w68"]}},"prod-BRZkuqi1":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-b4gkKBW4"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-zcFyOLGC"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-AM7YtKeO"]},"Evaluation":{"clause":"13.3.5.1","ids":["prod-ynRwNJgH"]},"IsDestructuring":{"clause":"14.7.5.2","ids":["prod-vPeih5lN"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-pXKW4iCP"]}},"prod-20SfjmEZ":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-lY5Cy7Sa"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-2i2KMoZq"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-Ca71SmWs"]},"Evaluation":{"clause":"13.3.2.1","ids":["prod-ufIc-5xW"]},"IsDestructuring":{"clause":"14.7.5.2","ids":["prod-IWE0dD8s"]},"AllPrivateIdentifiersValid":{"clause":"15.7.7","ids":["prod-hH1hyF7o"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-AGU05Shk"]}},"prod-NMg_0YQR":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-iarxBSr7"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-ELtmHyea"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-cHsc8BCy"]},"Evaluation":{"clause":"13.3.5.1","ids":["prod-oglQ-mZC"]},"IsDestructuring":{"clause":"14.7.5.2","ids":["prod-fNvFZX0j"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-wDQSEiH6"]}},"prod-cMsSM13C":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-VSHORtMa"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-6Bkmtp_X"]},"IsDestructuring":{"clause":"14.7.5.2","ids":["prod-9Ion7RwA"]}},"prod-xKiE8xPm":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-0Pk6P_by"]},"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-3VSXVmhU"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-1FBwi1xH"]},"IsDestructuring":{"clause":"14.7.5.2","ids":["prod-Q5WdRWI1"]}},"prod-w05b3u14":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-Vmis9Cmj"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-EEgk-Yff"]},"Evaluation":{"clause":"13.4.2.1","ids":["prod-rHS1jNn2"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-AxYNo76R"]}},"prod-ij__hpSO":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-Ou259nvv"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-RKIk04i1"]},"Evaluation":{"clause":"13.4.3.1","ids":["prod-wioTQf27"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-8wEdzYlR"]}},"prod-qnUAnDpi":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-TCON8m02"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-hxMCs-2O"]},"Evaluation":{"clause":"13.4.4.1","ids":["prod-10GLxGSJ"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-DlZME4qQ"]}},"prod-an6Vm9J4":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-pFhFynwZ"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-YQ2Qj3z4"]},"Evaluation":{"clause":"13.4.5.1","ids":["prod-DhW7Culr"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-tSq265UP"]}},"prod-n3f1x4OA":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-0dgjtiQ7"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-JRAAw485"]},"Evaluation":{"clause":"13.5.1.2","ids":["prod-1QeAbR0Z"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-AObKG7bs"]}},"prod-bEnaiUfM":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-9gYsYykc"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-L28J0B-W"]},"Evaluation":{"clause":"13.5.2.1","ids":["prod-aU1kwA1W"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-bZ_A9_ek"]}},"prod-oOmRMvU8":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-ol3I6Y7A"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-_pp9tysE"]},"Evaluation":{"clause":"13.5.3.1","ids":["prod-1gTisO9f"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-wEjVGAri"]}},"prod-55Xz_E0Z":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-Csq5hMXB"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-vWffOcNW"]},"Evaluation":{"clause":"13.5.4.1","ids":["prod-2HNipbZz"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-qq9s9o6K"]}},"prod-yxAmCDj1":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod--Zmi0P07"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-mkCLwyla"]},"Evaluation":{"clause":"13.5.5.1","ids":["prod-pAGhFy1g"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-i-bNI229"]}},"prod-nw8eIftf":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-QujNq09F"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-vQJ1qlPd"]},"Evaluation":{"clause":"13.5.6.1","ids":["prod-JRszWout"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-qryce9Aj"]}},"prod-4lEraLTO":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-BcCJ4AWM"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-2t1vDiwJ"]},"Evaluation":{"clause":"13.5.7.1","ids":["prod-bMAu-F7p"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-U263_8yR"]}},"prod-zVi0tVGF":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-RqMdwBuU"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-BbB1pUoP"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-tMRR2AUd"]}},"prod-EEr7dA-y":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-jkAKpcKK"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-zzL8pmfg"]},"Evaluation":{"clause":"13.6.1","ids":["prod-Ig4oSMA1"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-QjBqEERx"]}},"prod-D9vYTSYe":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-ycvianKq"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-8czRO4ZP"]},"Evaluation":{"clause":"13.7.1","ids":["prod-k6IpXNbV"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-siUuH5zP"]}},"prod--RZPkEex":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod--l26TQ9y"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-ORYKa--f"]},"Evaluation":{"clause":"13.8.1.1","ids":["prod-QDoARwWX"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-NqWi91A3"]}},"prod-XorHFOnH":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-jEr8YSqe"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-oZVlZzKh"]},"Evaluation":{"clause":"13.8.2.1","ids":["prod-YHTEjt6S"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-yLTyBgd3"]}},"prod-fBlf7SId":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-q04_MZWd"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-je3cRB7F"]},"Evaluation":{"clause":"13.9.1.1","ids":["prod-17NrpRTI"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-uY5on6s_"]}},"prod--QVo0NY2":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-1-75ya8a"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-SgrZC9mm"]},"Evaluation":{"clause":"13.9.2.1","ids":["prod-wu5oH3lt"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-2EFbRVMb"]}},"prod-VbX7s-GB":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-JHagwt8S"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-SrzEhL0f"]},"Evaluation":{"clause":"13.9.3.1","ids":["prod-erFDFU2C"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-DGTb9f0a"]}},"prod-KibMHocH":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-_TEzVLPJ"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-ZtojqFO1"]},"Evaluation":{"clause":"13.10.1","ids":["prod-3gCYoRfU"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-moN-TY1a"]}},"prod-W1sKvRa9":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-WH_Xpcdf"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-oCA1ZhR8"]},"Evaluation":{"clause":"13.10.1","ids":["prod-4iUOHdEx"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-9RitMb2a"]}},"prod-H5jP53q2":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-CcYM3Atg"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-F2jVn7Gn"]},"Evaluation":{"clause":"13.10.1","ids":["prod-jZs1rFWK"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-Ov8fY5LR"]}},"prod-g28T6iwt":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-24rx6YNr"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-1_mlatk2"]},"Evaluation":{"clause":"13.10.1","ids":["prod-ZF2k2rEh"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-Qjes4HD-"]}},"prod-abEstsgg":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-r0l0CEXN"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-V44oc_oI"]},"Evaluation":{"clause":"13.10.1","ids":["prod-X4T8u1As"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-a-QEMe-f"]}},"prod-8_yvvfCY":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-3O9Aii8g"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-I3ilBqyQ"]},"Evaluation":{"clause":"13.10.1","ids":["prod-Xv5acyHs"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-K4Kmo-4o"]}},"prod-3D8w-akN":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-2fesP1Zk"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-W4fdS6Hh"]},"Evaluation":{"clause":"13.10.1","ids":["prod-00OK517S"]},"AllPrivateIdentifiersValid":{"clause":"15.7.7","ids":["prod-5aKAQc0s"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-HF09HkQT"]}},"prod-UHCaQLr6":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-ryf2K57J"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-9wMtfL2T"]},"Evaluation":{"clause":"13.11.1","ids":["prod-EO4eBsqd"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-slB6AVFT"]}},"prod-J7HEcFq2":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-kpZwfqRO"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-pkhka4W_"]},"Evaluation":{"clause":"13.11.1","ids":["prod-zS10Lrlo"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod--y8v2xFz"]}},"prod-ugTHi1aM":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-TnQABgBJ"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-zJL_pZsv"]},"Evaluation":{"clause":"13.11.1","ids":["prod-gVfoAVuz"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-3nwl9Xq9"]}},"prod-6Ta8WxmN":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-RsN8Nsde"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-H08KK39f"]},"Evaluation":{"clause":"13.11.1","ids":["prod-q4vp8E6E"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-gkNFox60"]}},"prod-wrUN23HO":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-yP2rVm0A"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-ZtMQjV14"]},"Evaluation":{"clause":"13.12.1","ids":["prod-_rEQOot5"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-YGqkdmtG"]}},"prod-9YKtCpIQ":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-acZRdH_C"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-b8QyJMjt"]},"Evaluation":{"clause":"13.12.1","ids":["prod-Q4tADXpb"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-N6UlC2YT"]}},"prod-AgJdAkQg":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-FwH99KM9"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-E016H1hu"]},"Evaluation":{"clause":"13.12.1","ids":["prod-KiqD724B"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-xCUjATPv"]}},"prod-vZbQbZtn":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-FOQIZ2Ww"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-pL4CmROv"]},"Evaluation":{"clause":"13.13.1","ids":["prod-7s2sQWPJ"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-tjpyq_vi"]}},"prod-ACEMYh2d":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-0Mz2aish"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-9euGX5p6"]},"Evaluation":{"clause":"13.13.1","ids":["prod-3FN9c95J"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-mF39BKcc"]}},"prod-au86anjM":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-KPaiyU4J"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-CUQk8yb8"]},"Evaluation":{"clause":"13.13.1","ids":["prod-VuyYXoKA"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-XrXVT2tR"]}},"prod-mR1mZxSc":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-CMdoN6cr"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod--rPEOl_h"]},"Evaluation":{"clause":"13.14.1","ids":["prod-yhd-4Qj-"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-OM1J5OMs"]}},"prod-wU5Xsk6s":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-D9D2dUnP"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-d_vrZ4E2"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-EisiYgar"]}},"prod-eXKFjh2J":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-F_LSmUck"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod--dpqOTdc"]},"Evaluation":{"clause":"13.15.2","ids":["prod-dpJd5ekV"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-UQL2MJzG"]}},"prod-shfKC2mw":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-t02tAu6_"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-DZjLGTZE"]},"Evaluation":{"clause":"13.15.2","ids":["prod-d86UjzUy"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-HJVm6lHU"]}},"prod-hQLdzapj":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-jgF9l9Ty"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-7LWIIJBX"]},"Evaluation":{"clause":"13.15.2","ids":["prod-tjCiSw-h"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-oNpXbeRs"]}},"prod-w-48XpMo":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-U8uU_bab"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-Bj3Q77v8"]},"Evaluation":{"clause":"13.15.2","ids":["prod-H705EMCV"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-TNQR4MPF"]}},"prod-7NM9KEaO":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-ooZHsevq"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-Lo8Q8Acu"]},"Evaluation":{"clause":"13.15.2","ids":["prod-ity5YYTe"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-ML4QjaEz"]}},"prod-lT8vYmn_":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-1V2XVvzG"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-PrI2fhmx"]},"Evaluation":{"clause":"13.16.1","ids":["prod-9ohd9wHn"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-tcddXWO2"]}},"prod-nUwhqikN":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-dPINdG0A"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-MsqqUtwK"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-vU1F8zv6"]}},"prod-iYk5nCgu":{"IsFunctionDefinition":{"clause":"8.4.2","ids":["prod-8REG7QdK"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-OM0GWtO8"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-dfzrjfnA"]}},"prod-SoPEL49Y":{"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-69s6BRll"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-YxQ7Gh2N"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-mJe0J4L3"]}},"prod-Je5YcOXI":{"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-YIwB3WEl"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-XEUSovVm"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-tCjmqARP"]}},"prod-1wa_TGAR":{"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-AALLJG0-"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-7L0LV2jw"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-_eR92TK3"]}},"prod-D7ySJoLP":{"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-acg3mi3y"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-PZa6fcRc"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-Jg_ST3R4"]}},"prod-4BCWI5RW":{"IsIdentifierRef":{"clause":"8.4.4","ids":["prod-9GJ_tuZU"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-9QnU4opL"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-9ZhC3H4R"]}},"prod-m5AWMC3P":{"NamedEvaluation":{"clause":"8.4.5","ids":["prod-Q_6y5mca"]},"Evaluation":{"clause":"13.2.9.2","ids":["prod-cTC10Rwh"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-lff4OQNv"]}},"prod-mIr25y7h":{"Contains":{"clause":"8.5.1","ids":["prod-cKFrJVUo"]},"ClassDefinitionEvaluation":{"clause":"15.7.14","ids":["prod-AcPtObVs"]}},"prod-qUwUqfkW":{"Contains":{"clause":"8.5.1","ids":["prod-rrvBSOLD"]},"ClassStaticBlockDefinitionEvaluation":{"clause":"15.7.11","ids":["prod-sy-617ri"]}},"prod-mDvkFMKq":{"Contains":{"clause":"8.5.1","ids":["prod-bGWft0ts"]},"PropertyDefinitionEvaluation":{"clause":"13.2.5.5","ids":["prod-FVQpyKtq"]}},"prod-j68LXthC":{"Contains":{"clause":"8.5.1","ids":["prod-wul2dpOd"]},"PropName":{"clause":"8.6.5","ids":["prod-u_yMpuq5"]},"Evaluation":{"clause":"13.2.5.4","ids":["prod-ZrDWUX2E"]}},"prod-6y-_egWQ":{"Contains":{"clause":"8.5.1","ids":["prod-GysYUEUH"]},"Evaluation":{"clause":"13.3.7.1","ids":["prod-YiE5fXTa"]}},"prod-EOA2Fe3-":{"Contains":{"clause":"8.5.1","ids":["prod-uIhOYzuO"]},"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-H084cqoS"]},"Evaluation":{"clause":"13.3.2.1","ids":["prod-zAM15mqm"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-jkDZ--BF"]}},"prod-JoCAeM_3":{"Contains":{"clause":"8.5.1","ids":["prod-Aeadd-iM"]},"ChainEvaluation":{"clause":"13.3.9.2","ids":["prod-9T4kB2jq"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-hHSELWtc"]}},"prod-25V7_u74":{"Contains":{"clause":"8.5.1","ids":["prod-o08cCHMJ"]},"ChainEvaluation":{"clause":"13.3.9.2","ids":["prod-Il7WrbnC"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-IKKs3v0D"]}},"prod-yD9JWieS":{"ComputedPropertyContains":{"clause":"8.5.2","ids":["prod-A8PF_J4D"]},"PropName":{"clause":"8.6.5","ids":["prod-5EaGoVCR"]},"PrivateBoundIdentifiers":{"clause":"15.7.8","ids":["prod-3FDawUhc"]},"Evaluation":{"clause":"15.7.16","ids":["prod-jq_5Nm3c"]}},"prod-0EhkgOcT":{"ComputedPropertyContains":{"clause":"8.5.2","ids":["prod-KBlapLw6"]},"IsComputedPropertyKey":{"clause":"13.2.5.2","ids":["prod-SPDqK5VR"]}},"prod-vr_cfE7P":{"ComputedPropertyContains":{"clause":"8.5.2","ids":["prod-pgiwn-A8"]},"IsComputedPropertyKey":{"clause":"13.2.5.2","ids":["prod-SOs-1o2b"]}},"prod-BMcTBp4V":{"ComputedPropertyContains":{"clause":"8.5.2","ids":["prod-ZS17eYsY"]},"PropName":{"clause":"8.6.5","ids":["prod-CpdLYUt9"]},"HasDirectSuper":{"clause":"15.4.2","ids":["prod-IjiMaa22"]},"SpecialMethod":{"clause":"15.4.3","ids":["prod-pvkrotoO"]},"DefineMethod":{"clause":"15.4.4","ids":["prod-VntM4j0E"]},"MethodDefinitionEvaluation":{"clause":"15.4.5","ids":["prod-w_uDCOXP"]},"PrivateBoundIdentifiers":{"clause":"15.7.8","ids":["prod-pxy6kYq7"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-6Kc2wh10"]}},"prod-SnKN_cew":{"ComputedPropertyContains":{"clause":"8.5.2","ids":["prod-vyebD6Jr"]},"PropName":{"clause":"8.6.5","ids":["prod-5q0xQjd1"]},"HasDirectSuper":{"clause":"15.4.2","ids":["prod-DQeOw0IT"]},"SpecialMethod":{"clause":"15.4.3","ids":["prod-wnqbOfrS"]},"MethodDefinitionEvaluation":{"clause":"15.4.5","ids":["prod-JtMhObe9"]},"PrivateBoundIdentifiers":{"clause":"15.7.8","ids":["prod-axmlrr3F"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-9ZjrMW3N"]}},"prod-nWs7csn9":{"ComputedPropertyContains":{"clause":"8.5.2","ids":["prod-49ueHbo6"]},"PropName":{"clause":"8.6.5","ids":["prod-Pj7-Oy-Q"]},"HasDirectSuper":{"clause":"15.4.2","ids":["prod-H05PoHaH"]},"SpecialMethod":{"clause":"15.4.3","ids":["prod-9m8VG-FD"]},"MethodDefinitionEvaluation":{"clause":"15.4.5","ids":["prod-tr90svxc"]},"PrivateBoundIdentifiers":{"clause":"15.7.8","ids":["prod-9-TzGQnW"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-WPITwaqC"]}},"prod-8GV2khgE":{"ComputedPropertyContains":{"clause":"8.5.2","ids":["prod-clQ5cW-v"]},"PropName":{"clause":"8.6.5","ids":["prod-zA_cSICS"]},"HasDirectSuper":{"clause":"15.4.2","ids":["prod-u4Tk9i08"]},"MethodDefinitionEvaluation":{"clause":"15.4.5","ids":["prod-qDk-XFAF"]},"PrivateBoundIdentifiers":{"clause":"15.7.8","ids":["prod-Qvq1cmEs"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-6uQ7SWxA"]}},"prod-ceV74b-L":{"ComputedPropertyContains":{"clause":"8.5.2","ids":["prod-7J1puDuJ"]},"PropName":{"clause":"8.6.5","ids":["prod-kfKLLmSB"]},"HasDirectSuper":{"clause":"15.4.2","ids":["prod-OGEtsTHJ"]},"MethodDefinitionEvaluation":{"clause":"15.4.5","ids":["prod-lPECR135"]},"PrivateBoundIdentifiers":{"clause":"15.7.8","ids":["prod-1nK7U43p"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-mThhZsRd"]}},"prod-sKhHHXFQ":{"ComputedPropertyContains":{"clause":"8.5.2","ids":["prod-w3-p5Y-S"]},"ConstructorMethod":{"clause":"15.7.3","ids":["prod-6CQGn2J9"]},"NonConstructorElements":{"clause":"15.7.5","ids":["prod-ax67ii0j"]},"PrototypePropertyNameList":{"clause":"15.7.6","ids":["prod-yD4OjNLB"]},"PrivateBoundIdentifiers":{"clause":"15.7.8","ids":["prod-PTQtTdvS"]}},"prod-MThA5IaK":{"ComputedPropertyContains":{"clause":"8.5.2","ids":["prod-a6HgYRcV"]},"PropName":{"clause":"8.6.5","ids":["prod-auRJV_iy"]},"ClassElementKind":{"clause":"15.7.2","ids":["prod--zCXluqv"]},"IsStatic":{"clause":"15.7.4","ids":["prod-1JW7WXBn"]},"PrivateBoundIdentifiers":{"clause":"15.7.8","ids":["prod-8T9v42E5"]},"ClassElementEvaluation":{"clause":"15.7.13","ids":["prod-Hb23PvBK"]}},"prod-40k8u1X0":{"ComputedPropertyContains":{"clause":"8.5.2","ids":["prod-uyqDiD0W"]},"PropName":{"clause":"8.6.5","ids":["prod-eIc0iw1U"]},"ClassElementKind":{"clause":"15.7.2","ids":["prod-U_NLPgRJ"]},"IsStatic":{"clause":"15.7.4","ids":["prod-LP0OJ3qJ"]},"PrivateBoundIdentifiers":{"clause":"15.7.8","ids":["prod-mMa7qdyC"]},"ClassElementEvaluation":{"clause":"15.7.13","ids":["prod-V88LvFxI"]}},"prod-80co-gZ6":{"ComputedPropertyContains":{"clause":"8.5.2","ids":["prod-yQr72pM_"]},"PropName":{"clause":"8.6.5","ids":["prod-cOwxJsMP"]},"HasDirectSuper":{"clause":"15.4.2","ids":["prod-p8Pkhz62"]},"MethodDefinitionEvaluation":{"clause":"15.4.5","ids":["prod-a75_jVUN"]},"PrivateBoundIdentifiers":{"clause":"15.7.8","ids":["prod-zTa8Ph70"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-UU7zbVYJ"]}},"prod-qdC94hXo":{"ComputedPropertyContains":{"clause":"8.5.2","ids":["prod-s8Rlgqlc"]},"PropName":{"clause":"8.6.5","ids":["prod-NW7fjJTs"]},"PrivateBoundIdentifiers":{"clause":"15.7.8","ids":["prod-QQ9gR7rA"]},"ClassFieldDefinitionEvaluation":{"clause":"15.7.10","ids":["prod-deOh_-BS"]}},"prod-5GwwFymY":{"BindingInitialization":{"clause":"8.6.2","ids":["prod-D4AQahDE"]}},"prod-nQ2ZFnUa":{"BindingInitialization":{"clause":"8.6.2","ids":["prod-5QoB3lmK"]}},"prod-xrMoI6uo":{"BindingInitialization":{"clause":"8.6.2","ids":["prod-LZltxEP-"]}},"prod-5lmgiaFr":{"BindingInitialization":{"clause":"8.6.2","ids":["prod-PoaYdJZS"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-6b4rrD_8"]}},"prod-0fOwNHr-":{"IteratorBindingInitialization":{"clause":"8.6.3","ids":["prod-evgdYCB8"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-NXTQAWlJ"]}},"prod-iBHkClE5":{"IteratorBindingInitialization":{"clause":"8.6.3","ids":["prod-QEcf_4fA"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-TzoSXJM8"]}},"prod-7Fo_GcBM":{"IteratorBindingInitialization":{"clause":"8.6.3","ids":["prod-D3j0ZmD-"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-4Zv7nEzD"]},"IsSimpleParameterList":{"clause":"15.1.3","ids":["prod-suhNtUzj"]},"ExpectedArgumentCount":{"clause":"15.1.5","ids":["prod-u-Q5LrzT"]}},"prod-I7oDJnBY":{"IteratorBindingInitialization":{"clause":"8.6.3","ids":["prod-1SN5A2Ci"]},"ContainsExpression":{"clause":"15.1.2","ids":["prod-gFcfnGJu"]},"IsSimpleParameterList":{"clause":"15.1.3","ids":["prod-qGPu4-Bq"]},"ExpectedArgumentCount":{"clause":"15.1.5","ids":["prod-df9_W4vY"]}},"prod-dL7e73Zt":{"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-RnnOsVyV"]},"Evaluation":{"clause":"13.1.3","ids":["prod-12IVipzn"]},"ContainsArguments":{"clause":"15.7.9","ids":["prod-K0gmEtvp"]}},"prod-dN4C9Ooo":{"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-RHpmBFMY"]},"StringValue":{"clause":"13.1.2","ids":["prod-TEe-WTI-"]},"Evaluation":{"clause":"13.1.3","ids":["prod-MHlI0_J2"]}},"prod-iAOJjaxZ":{"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-Q9hezMXb"]},"StringValue":{"clause":"13.1.2","ids":["prod-ov5ki9Up"]},"Evaluation":{"clause":"13.1.3","ids":["prod-7dhF3jkA"]}},"prod-Shb6Dgff":{"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-G2CxyRR8"]},"Evaluation":{"clause":"13.3.2.1","ids":["prod-JQpFT9fK"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-tR1iepZf"]}},"prod-FwaLgcLH":{"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-hU5p3vdM"]},"Evaluation":{"clause":"13.3.2.1","ids":["prod-CLxiRtJM"]},"AllPrivateIdentifiersValid":{"clause":"15.7.7","ids":["prod-9EwGAkEl"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-qcy6aC3l"]}},"prod-ltrZioVe":{"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-tKZdJ1b_"]},"Evaluation":{"clause":"13.3.6.1","ids":["prod-4XjrYD2l"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-bByIrGsD"]}},"prod-G9gIp39y":{"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-N96SKFWl"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-ErkBAfx1"]}},"prod-5bjr6Yqy":{"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-UEqjljYk"]}},"prod-kYvem_87":{"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-fZIg56D8"]},"Evaluation":{"clause":"13.3.6.1","ids":["prod-nikwMTuV"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-lkRAvRUF"]}},"prod-WPBp76A-":{"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-AgSQnEAG"]},"Evaluation":{"clause":"13.3.11.1","ids":["prod-N2ZjHnZW"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-e9jubpnL"]}},"prod-4bMdCOPa":{"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-jkiznuvy"]},"Evaluation":{"clause":"13.3.12.1","ids":["prod-OIanAQRE"]}},"prod-qIsN6LkP":{"AssignmentTargetType":{"clause":"8.6.4","ids":["prod-6GBPx2Io"]},"Evaluation":{"clause":"13.3.12.1","ids":["prod-ZjGYptj_"]}},"prod-_kSpAuMA":{"PropName":{"clause":"8.6.5","ids":["prod-qwkHLLWn"]},"PropertyDefinitionEvaluation":{"clause":"13.2.5.5","ids":["prod-pxaBv7Tq"]}},"prod-vZMKiSRJ":{"PropName":{"clause":"8.6.5","ids":["prod-LNEVDzQo"]},"PropertyDefinitionEvaluation":{"clause":"13.2.5.5","ids":["prod-r1teTyPc"]}},"prod-Jsxupyj1":{"PropName":{"clause":"8.6.5","ids":["prod-T9fmdB_X"]},"PropertyDefinitionEvaluation":{"clause":"13.2.5.5","ids":["prod-N8qwXXqo"]}},"prod-ueikIsNm":{"PropName":{"clause":"8.6.5","ids":["prod-Xw0182zP"]},"Evaluation":{"clause":"13.2.5.4","ids":["prod-Jt_nMkj7"]}},"prod-6-SoljXV":{"PropName":{"clause":"8.6.5","ids":["prod-nyDilreQ"]},"Evaluation":{"clause":"13.2.5.4","ids":["prod-_aZrbYKk"]}},"prod-V7gahr3e":{"PropName":{"clause":"8.6.5","ids":["prod-r9-JDvZR"]},"Evaluation":{"clause":"13.2.5.4","ids":["prod-6rX2zzfJ"]}},"prod-CKMymB_i":{"EvaluateBody":{"clause":"10.2.1.3","ids":["prod-xc-5PFkl"]},"FunctionBodyContainsUseStrict":{"clause":"15.2.2","ids":["prod-SI3y-Fh-"]},"EvaluateFunctionBody":{"clause":"15.2.3","ids":["prod-BiHevouZ"]}},"prod-PKmJj3Nf":{"EvaluateBody":{"clause":"10.2.1.3","ids":["prod-dp9uKN5f"]},"EvaluateGeneratorBody":{"clause":"15.5.2","ids":["prod-LwSgcEYg"]}},"prod-9f9S8TE_":{"EvaluateBody":{"clause":"10.2.1.3","ids":["prod-_F5bCEpP"]},"EvaluateAsyncGeneratorBody":{"clause":"15.6.2","ids":["prod-SWMcozzE"]}},"prod-LKwCGkpu":{"EvaluateBody":{"clause":"10.2.1.3","ids":["prod-V5mALOgb"]},"EvaluateAsyncFunctionBody":{"clause":"15.8.4","ids":["prod-jL__NzW5"]}},"prod-P2DNnhoV":{"EvaluateBody":{"clause":"10.2.1.3","ids":["prod-pu8sYeYA"]}},"prod-BArMnydQ":{"EvaluateBody":{"clause":"10.2.1.3","ids":["prod-X0MRkB7d"]},"EvaluateClassStaticBlockBody":{"clause":"15.7.12","ids":["prod-1dy60deL"]}},"prod-NFOBX-lw":{"IdentifierCodePoints":{"clause":"12.7.1.2","ids":["prod-NbI37jnW"]},"StringValue":{"clause":"13.1.2","ids":["prod-RwRM8vDx"]}},"prod-dbXHPjzF":{"IdentifierCodePoints":{"clause":"12.7.1.2","ids":["prod-VGIPQeJb"]},"StringValue":{"clause":"13.1.2","ids":["prod-NS6rHu2W"]}},"prod-XMog322C":{"IdentifierCodePoint":{"clause":"12.7.1.3","ids":["prod-KPs_9x-C"]}},"prod-ba_xP9Ao":{"IdentifierCodePoint":{"clause":"12.7.1.3","ids":["prod-fncA2sGb"]}},"prod-yPsTqmeL":{"IdentifierCodePoint":{"clause":"12.7.1.3","ids":["prod-Ju5Gi-Fv"]}},"prod-qIqpq7Bo":{"IdentifierCodePoint":{"clause":"12.7.1.3","ids":["prod-XpfJkBRq"]}},"prod-Qn_oyvq2":{"NumericValue":{"clause":"12.9.3.3","ids":["prod-6EKD79IF"]}},"prod-U27qMVVP":{"NumericValue":{"clause":"12.9.3.3","ids":["prod-VwBAoy40"]}},"prod-9vicHpLh":{"NumericValue":{"clause":"12.9.3.3","ids":["prod-n5uysvQ-"]}},"prod-lP2MlcII":{"NumericValue":{"clause":"12.9.3.3","ids":["prod-MgVpq-Ot"]}},"prod-v-a6rh2w":{"NumericValue":{"clause":"12.9.3.3","ids":["prod-_KqL62EN"]}},"prod-b9VW4Mn-":{"NumericValue":{"clause":"12.9.3.3","ids":["prod-k8d8Sn1k","prod-6lkR-0p2"]}},"prod-fgQ6BNSW":{"NumericValue":{"clause":"12.9.3.3","ids":["prod-Rb94_ol-"]}},"prod-6WVj7Zp6":{"BodyText":{"clause":"12.9.5.1","ids":["prod-GHASI6lr"]},"FlagText":{"clause":"12.9.5.2","ids":["prod-U3zNjneX"]}},"prod-aHP0cTnm":{"StringValue":{"clause":"13.1.2","ids":["prod-APZnd9XH"]}},"prod-8xe5-4Uo":{"StringValue":{"clause":"13.1.2","ids":["prod-z0WsNljd"]}},"prod-OqjWNqf4":{"StringValue":{"clause":"13.1.2","ids":["prod-3LDrFiW5"]}},"prod-j40wR5UN":{"StringValue":{"clause":"13.1.2","ids":["prod-nzu557qc"]}},"prod-50n3LPul":{"StringValue":{"clause":"13.1.2","ids":["prod-Vk-n5Kcs"]},"ReferencedBindings":{"clause":"16.2.3.6","ids":["prod-hGf2GDb1"]}},"prod-3wWoyoyk":{"Evaluation":{"clause":"13.2.3.1","ids":["prod-5gR2ZD66"]}},"prod-T8-D_rlw":{"Evaluation":{"clause":"13.2.3.1","ids":["prod-phcGo5D8"]}},"prod-qwQbursv":{"Evaluation":{"clause":"13.2.3.1","ids":["prod-JJ6LucaR"]}},"prod-JuPoYov6":{"Evaluation":{"clause":"13.2.3.1","ids":["prod-JaYVP4rC"]}},"prod-UVeRCADp":{"ArrayAccumulation":{"clause":"13.2.4.1","ids":["prod-ACq7eTCD"]},"IteratorDestructuringAssignmentEvaluation":{"clause":"13.15.5.5","ids":["prod-4Wj_oyTQ"]}},"prod-lq_Nojbr":{"ArrayAccumulation":{"clause":"13.2.4.1","ids":["prod-KyZNZ-MT"]},"IteratorDestructuringAssignmentEvaluation":{"clause":"13.15.5.5","ids":["prod-zWmQntmV"]}},"prod-nakNeXAG":{"ArrayAccumulation":{"clause":"13.2.4.1","ids":["prod-_juTnZH7"]}},"prod-XL4uSEt_":{"ArrayAccumulation":{"clause":"13.2.4.1","ids":["prod-PNKSiljq"]}},"prod-rNLR62Va":{"ArrayAccumulation":{"clause":"13.2.4.1","ids":["prod-9ZiZA1Ch"]}},"prod-BSaguLF3":{"ArrayAccumulation":{"clause":"13.2.4.1","ids":["prod-HRfw0EOP"]}},"prod-H9W06sct":{"ArrayAccumulation":{"clause":"13.2.4.1","ids":["prod-_w8Sn596"]}},"prod-oN6pjX9m":{"Evaluation":{"clause":"13.2.4.2","ids":["prod-8EXlViH4"]}},"prod-Y8wRJ4om":{"Evaluation":{"clause":"13.2.4.2","ids":["prod-58ym50AN"]}},"prod-je9iGq8a":{"Evaluation":{"clause":"13.2.4.2","ids":["prod-f05iKqYb"]}},"prod-BIN60s98":{"PropertyNameList":{"clause":"13.2.5.3","ids":["prod-ojv3z_1M"]}},"prod-c72dXkTz":{"PropertyNameList":{"clause":"13.2.5.3","ids":["prod-arjQ9VdV"]},"PropertyDefinitionEvaluation":{"clause":"13.2.5.5","ids":["prod-2nasR_1u"]}},"prod-4iBxhmtp":{"Evaluation":{"clause":"13.2.5.4","ids":["prod-iYCMBfyG"]}},"prod-tbtFUUOH":{"Evaluation":{"clause":"13.2.5.4","ids":["prod-0f4gdKLJ"]}},"prod-k6AQl_P9":{"Evaluation":{"clause":"13.2.5.4","ids":["prod-HzxDeaw2"]}},"prod-d430kMbv":{"TemplateStrings":{"clause":"13.2.8.2","ids":["prod-wUHw6ReH"]},"Evaluation":{"clause":"13.2.8.6","ids":["prod-1J8emXVO"]},"ArgumentListEvaluation":{"clause":"13.3.8.1","ids":["prod-EUsfaoKE"]}},"prod-nG1t-jNI":{"TemplateStrings":{"clause":"13.2.8.2","ids":["prod-AfRnt93a"]},"Evaluation":{"clause":"13.2.8.6","ids":["prod-uvbVZ8aQ"]},"ArgumentListEvaluation":{"clause":"13.3.8.1","ids":["prod-RX4K7HKv"]}},"prod-MrvlbnHm":{"TemplateStrings":{"clause":"13.2.8.2","ids":["prod-SXp_0Muf"]},"SubstitutionEvaluation":{"clause":"13.2.8.5","ids":["prod-h8M7VnrX"]},"Evaluation":{"clause":"13.2.8.6","ids":["prod-Cn8o0vt2"]}},"prod-j0qqWY2p":{"TemplateStrings":{"clause":"13.2.8.2","ids":["prod-fValkc1v"]},"SubstitutionEvaluation":{"clause":"13.2.8.5","ids":["prod-0ukbbNyO"]},"Evaluation":{"clause":"13.2.8.6","ids":["prod-4-zhpQ6s"]}},"prod-V4hc4rPI":{"TemplateStrings":{"clause":"13.2.8.2","ids":["prod-sExxMRoA"]},"SubstitutionEvaluation":{"clause":"13.2.8.5","ids":["prod-oOPfrahZ"]},"Evaluation":{"clause":"13.2.8.6","ids":["prod-EX4ICnFk"]}},"prod-PHoLfCK_":{"TemplateStrings":{"clause":"13.2.8.2","ids":["prod-oVK_xc-L"]},"SubstitutionEvaluation":{"clause":"13.2.8.5","ids":["prod-Jm_C6N1j"]},"Evaluation":{"clause":"13.2.8.6","ids":["prod-F5opRz-R"]}},"prod-lWlOKYig":{"Evaluation":{"clause":"13.3.7.1","ids":["prod-AopplWA-"]}},"prod-qBjKPlc1":{"Evaluation":{"clause":"13.3.7.1","ids":["prod--j5ruhLQ"]}},"prod-lgwqNVq7":{"ArgumentListEvaluation":{"clause":"13.3.8.1","ids":["prod-qXYYcvIK"]}},"prod-7tzqa9tS":{"ArgumentListEvaluation":{"clause":"13.3.8.1","ids":["prod-6LIBrAp-"]}},"prod-bq3bMpyK":{"ArgumentListEvaluation":{"clause":"13.3.8.1","ids":["prod-9NFeGQ82"]}},"prod--rnN0MQv":{"ArgumentListEvaluation":{"clause":"13.3.8.1","ids":["prod-avUGM8aa"]}},"prod-1jakKBk1":{"ArgumentListEvaluation":{"clause":"13.3.8.1","ids":["prod-Au9Wi9yT"]}},"prod-t3USkzuD":{"ArgumentListEvaluation":{"clause":"13.3.8.1","ids":["prod-_obYKRXG"]}},"prod-AiLVvGnw":{"Evaluation":{"clause":"13.3.9.1","ids":["prod--_aqugGj"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-qFVLp3q-"]}},"prod-dfra8X0j":{"Evaluation":{"clause":"13.3.9.1","ids":["prod-k1PrC9LR"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-UqoX45R5"]}},"prod-iAWRBWZp":{"Evaluation":{"clause":"13.3.9.1","ids":["prod-TDZnNZ1K"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-pHLlfSmO"]}},"prod-J4fvvwWl":{"ChainEvaluation":{"clause":"13.3.9.2","ids":["prod-1C3YSxR_"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-PSEzAHN6"]}},"prod-a5k1i_eU":{"ChainEvaluation":{"clause":"13.3.9.2","ids":["prod-w5u7jzLu"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-gfhvmXSt"]}},"prod-qtd11XGp":{"ChainEvaluation":{"clause":"13.3.9.2","ids":["prod-JeRaAt5H"]},"AllPrivateIdentifiersValid":{"clause":"15.7.7","ids":["prod-GLUsMLG4"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-dlN3twzl"]}},"prod-zMZUOMrf":{"ChainEvaluation":{"clause":"13.3.9.2","ids":["prod-kAXkNcIE"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-pk-z4M2l"]}},"prod-4aVR1jLh":{"ChainEvaluation":{"clause":"13.3.9.2","ids":["prod-PNgnxyKa"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-Yn8_Hl_k"]}},"prod-MW9Cgivd":{"ChainEvaluation":{"clause":"13.3.9.2","ids":["prod-5tv-oPv9"]},"AllPrivateIdentifiersValid":{"clause":"15.7.7","ids":["prod-LZl0sxgi"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-NQG4pluL"]}},"prod-uZn3IQfi":{"Evaluation":{"clause":"13.3.10.1","ids":["prod-4N8EtSSM"]}},"prod-Ix53lok1":{"DestructuringAssignmentEvaluation":{"clause":"13.15.5.2","ids":["prod-3gUcVFuf"]}},"prod-3uSyi6IT":{"DestructuringAssignmentEvaluation":{"clause":"13.15.5.2","ids":["prod-BL-EfQkR"]}},"prod-S2lwsZIP":{"DestructuringAssignmentEvaluation":{"clause":"13.15.5.2","ids":["prod-w0nDUCli","prod-c6GsLBP6"]}},"prod-O0K_hLF1":{"DestructuringAssignmentEvaluation":{"clause":"13.15.5.2","ids":["prod-V79sItM3"]}},"prod-lF9xCwj2":{"DestructuringAssignmentEvaluation":{"clause":"13.15.5.2","ids":["prod-EbrhbyXb","prod-zzOr3EoW","prod--ENeYZ8i"]}},"prod-VmyFmgP-":{"DestructuringAssignmentEvaluation":{"clause":"13.15.5.2","ids":["prod-IYCbjDvt"]}},"prod-U5w44WHu":{"DestructuringAssignmentEvaluation":{"clause":"13.15.5.2","ids":["prod-GIS42l5L"]}},"prod-Zg8oWRHF":{"PropertyDestructuringAssignmentEvaluation":{"clause":"13.15.5.3","ids":["prod-ysaEPEoc"]}},"prod-3q7yGYEa":{"PropertyDestructuringAssignmentEvaluation":{"clause":"13.15.5.3","ids":["prod-yhW4Xo3o"]}},"prod-v1dWCZ87":{"PropertyDestructuringAssignmentEvaluation":{"clause":"13.15.5.3","ids":["prod-P2UQDIgF"]}},"prod-mUDd8nHs":{"RestDestructuringAssignmentEvaluation":{"clause":"13.15.5.4","ids":["prod-uer86s2s"]}},"prod-3BNUmQs7":{"IteratorDestructuringAssignmentEvaluation":{"clause":"13.15.5.5","ids":["prod-wdwg9MFc"]}},"prod-Ud4u6J-Q":{"IteratorDestructuringAssignmentEvaluation":{"clause":"13.15.5.5","ids":["prod-LgDa64vV"]}},"prod-sl9Zadb9":{"IteratorDestructuringAssignmentEvaluation":{"clause":"13.15.5.5","ids":["prod-vVbhdjr0","prod-gwNUTqrO"]}},"prod-qvQWEQo1":{"IteratorDestructuringAssignmentEvaluation":{"clause":"13.15.5.5","ids":["prod-L7cVew9S"]},"KeyedDestructuringAssignmentEvaluation":{"clause":"13.15.5.6","ids":["prod-M4lsIchc"]}},"prod-DMURMN0m":{"IteratorDestructuringAssignmentEvaluation":{"clause":"13.15.5.5","ids":["prod-NB8JhQlN"]}},"prod-r35GfF0W":{"Evaluation":{"clause":"14.1.1","ids":["prod-cXJGjZtb"]},"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-FSHcHfYw"]}},"prod-P9s8hLuP":{"PropertyBindingInitialization":{"clause":"14.3.3.1","ids":["prod--5EhKk0m"]}},"prod-ltwW708a":{"RestBindingInitialization":{"clause":"14.3.3.2","ids":["prod-jjw6mbi6"]}},"prod-hl28S5p6":{"Evaluation":{"clause":"14.4.1","ids":["prod-il1Ue5QP"]}},"prod-XGPiPhtM":{"Evaluation":{"clause":"14.5.1","ids":["prod-zmcsioZW"]}},"prod-nthWw5bM":{"LoopEvaluation":{"clause":"14.7.1.2","ids":["prod-bY0mbJsd"]}},"prod-J0YbLQ2x":{"LoopEvaluation":{"clause":"14.7.1.2","ids":["prod-pBcbxGRB"]}},"prod-r-Sjm4F3":{"LoopEvaluation":{"clause":"14.7.1.2","ids":["prod-FuTGGBHg"]}},"prod-Q0CapowH":{"LoopEvaluation":{"clause":"14.7.1.2","ids":["prod-RfvZcfJK"]}},"prod-RT3Hrl25":{"IsDestructuring":{"clause":"14.7.5.2","ids":["prod-HvnSrzbi"]}},"prod-gwk9Iaq2":{"IsDestructuring":{"clause":"14.7.5.2","ids":["prod-AsYWUqR1"]}},"prod-rDLkyb_q":{"IsDestructuring":{"clause":"14.7.5.2","ids":["prod-n6CWa3rF"]}},"prod-zZYaGxQ8":{"Evaluation":{"clause":"14.10.1","ids":["prod-G_yzzAkQ"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-1dE_5B3o"]}},"prod-TbDZIC37":{"Evaluation":{"clause":"14.10.1","ids":["prod-iroo5DiR"]},"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-dyDXTOIV"]}},"prod-jug3e433":{"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-RLprpFgP"]}},"prod-xepAqppR":{"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-wFzN_sG0"]}},"prod-HB_2xdti":{"LabelledEvaluation":{"clause":"14.13.4","ids":["prod-7PJ339VQ"]}},"prod-E5ckYtCh":{"Evaluation":{"clause":"14.14.1","ids":["prod-fEMuit66"]}},"prod-ybInUotF":{"CatchClauseEvaluation":{"clause":"14.15.2","ids":["prod-7Gz_IT_v"]}},"prod-Kx8jxmHA":{"Evaluation":{"clause":"14.16.1","ids":["prod-eDCsgVlr"]}},"prod-gUzIea_C":{"IsSimpleParameterList":{"clause":"15.1.3","ids":["prod-3o8iyoDi"]},"ExpectedArgumentCount":{"clause":"15.1.5","ids":["prod-wqRyU6iR"]}},"prod-H68ZoagN":{"IsSimpleParameterList":{"clause":"15.1.3","ids":["prod-uFFTeOPE"]}},"prod-NNXqGrU3":{"ExpectedArgumentCount":{"clause":"15.1.5","ids":["prod-WmFS8bja"]}},"prod-KB8f5_em":{"ExpectedArgumentCount":{"clause":"15.1.5","ids":["prod-01YV1lrL"]}},"prod-c6cxJePv":{"ConciseBodyContainsUseStrict":{"clause":"15.3.2","ids":["prod-72drK4Uu"]}},"prod-Eaqym5cf":{"Evaluation":{"clause":"15.3.5","ids":["prod-K1YpROJJ"]}},"prod-p-hcBiIQ":{"SpecialMethod":{"clause":"15.4.3","ids":["prod-rP4adc9Q"]}},"prod-SD1i1opG":{"SpecialMethod":{"clause":"15.4.3","ids":["prod-YxKa5Jjx"]}},"prod-y0j2wcW4":{"SpecialMethod":{"clause":"15.4.3","ids":["prod-0jHLXbe4"]}},"prod-Ldhpu6QZ":{"Evaluation":{"clause":"15.5.5","ids":["prod-R-GDUsNW"]}},"prod-eT7GKT7i":{"Evaluation":{"clause":"15.5.5","ids":["prod-WbSBzREt"]}},"prod-iAdFfqlf":{"Evaluation":{"clause":"15.5.5","ids":["prod-gD5_zJlG"]}},"prod-NjP_487X":{"ClassElementKind":{"clause":"15.7.2","ids":["prod-z4kY36XR"]},"IsStatic":{"clause":"15.7.4","ids":["prod-CtxLpivn"]},"ClassElementEvaluation":{"clause":"15.7.13","ids":["prod-RV4ZOA0y"]}},"prod-0XtyXojL":{"ClassElementKind":{"clause":"15.7.2","ids":["prod-WYqnrGO2"]},"IsStatic":{"clause":"15.7.4","ids":["prod-lR6jUbAy"]},"ClassElementEvaluation":{"clause":"15.7.13","ids":["prod-DNhqQKHO"]}},"prod-RVH9JhqU":{"ClassElementKind":{"clause":"15.7.2","ids":["prod-gbiOT0dB"]},"IsStatic":{"clause":"15.7.4","ids":["prod-gXtZ0OpF"]},"ClassElementEvaluation":{"clause":"15.7.13","ids":["prod-tPq9hD-G"]}},"prod-8cGH1X5O":{"ClassElementKind":{"clause":"15.7.2","ids":["prod-aKP7bsri"]},"IsStatic":{"clause":"15.7.4","ids":["prod-wyUVxCrb"]},"ClassElementEvaluation":{"clause":"15.7.13","ids":["prod-Cn1oLmsN"]}},"prod-haKPgLO7":{"ConstructorMethod":{"clause":"15.7.3","ids":["prod-5dD0G3pr"]},"NonConstructorElements":{"clause":"15.7.5","ids":["prod-19e_yBXp"]},"PrototypePropertyNameList":{"clause":"15.7.6","ids":["prod-A14zfyT4"]}},"prod-VFbPG7Xd":{"AllPrivateIdentifiersValid":{"clause":"15.7.7","ids":["prod-7rm6mrow"]}},"prod-KVWS267v":{"PrivateBoundIdentifiers":{"clause":"15.7.8","ids":["prod-T6diBlyd"]}},"prod-daps6IoT":{"Evaluation":{"clause":"15.8.5","ids":["prod-AKHRjjan"]}},"prod-Kq4Uu2cU":{"AsyncConciseBodyContainsUseStrict":{"clause":"15.9.2","ids":["prod-NdVhlp_L"]}},"prod-0GReIdCH":{"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-5uO1VxFZ"]}},"prod-AoB9QhTO":{"ModuleRequests":{"clause":"16.2.1.3","ids":["prod-K1adkbP6"]}},"prod-hjv695N2":{"ModuleRequests":{"clause":"16.2.1.3","ids":["prod-geKEXfWi"]}},"prod-jN7l5yAN":{"Evaluation":{"clause":"16.2.1.11","ids":["prod-6SEwZT9o"]}},"prod-XHs8lcig":{"ImportEntriesForModule":{"clause":"16.2.2.3","ids":["prod-8iON-ECl"]}},"prod-AScJop1Y":{"ImportEntriesForModule":{"clause":"16.2.2.3","ids":["prod-UUrB05kM"]}},"prod-z0N66GR4":{"ImportEntriesForModule":{"clause":"16.2.2.3","ids":["prod-EknrR_3b"]}},"prod-tKOro2Xm":{"ExportedBindings":{"clause":"16.2.3.2","ids":["prod-TQTcajTg"]},"ExportedNames":{"clause":"16.2.3.3","ids":["prod-tyOEKkRB"]},"ExportEntriesForModule":{"clause":"16.2.3.5","ids":["prod-mzZ83dVi"]},"ReferencedBindings":{"clause":"16.2.3.6","ids":["prod-SuOfrU8K"]}},"prod-JgWQiNCe":{"ExportedBindings":{"clause":"16.2.3.2","ids":["prod-2N5gUMor"]},"ExportedNames":{"clause":"16.2.3.3","ids":["prod-VeE5fiYD"]},"ExportEntriesForModule":{"clause":"16.2.3.5","ids":["prod-zadzACBk"]},"ReferencedBindings":{"clause":"16.2.3.6","ids":["prod-eGw90zQ9"]}},"prod-GlqP_AXb":{"ExportedBindings":{"clause":"16.2.3.2","ids":["prod-XDdQfOn3"]},"ExportedNames":{"clause":"16.2.3.3","ids":["prod-KtpQleM7"]},"ExportEntriesForModule":{"clause":"16.2.3.5","ids":["prod-IZvnHgpZ"]}},"prod-ya486nM7":{"ExportedBindings":{"clause":"16.2.3.2","ids":["prod-Hr-D5Mzb"]},"ExportedNames":{"clause":"16.2.3.3","ids":["prod-jiop1t1m"]},"ExportEntriesForModule":{"clause":"16.2.3.5","ids":["prod-WH6U71Y1"]},"ReferencedBindings":{"clause":"16.2.3.6","ids":["prod-tdM6ZJNC"]}},"prod-efW0NtUW":{"ExportedNames":{"clause":"16.2.3.3","ids":["prod-H38kB23_"]},"ExportEntriesForModule":{"clause":"16.2.3.5","ids":["prod-Xa_xAKMV"]}},"prod-N6rwTU5m":{"ExportedNames":{"clause":"16.2.3.3","ids":["prod-2_hHRuoS"]},"ExportEntriesForModule":{"clause":"16.2.3.5","ids":["prod-1scalAlY"]}},"prod-gG1rdVmA":{"ExportedNames":{"clause":"16.2.3.3","ids":["prod-zlltzYPM"]}},"prod-hD8TcowF":{"ReferencedBindings":{"clause":"16.2.3.6","ids":["prod-YJpWFrW7"]}},"prod-PUMw6WxS":{"CapturingGroupNumber":{"clause":"22.2.1.4","ids":["prod-xT1sXsIe","prod-lKRUpdJ5"]}},"prod-ee-3CYw6":{"IsCharacterClass":{"clause":"22.2.1.5","ids":["prod-G-2_KzF0"]},"CharacterValue":{"clause":"22.2.1.6","ids":["prod-xjk33vk0"]},"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-v1pSxa5N"]}},"prod-DSKNclKY":{"IsCharacterClass":{"clause":"22.2.1.5","ids":["prod-c9Gs2CyN"]},"CharacterValue":{"clause":"22.2.1.6","ids":["prod-r7Whzgyd"]},"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-XIQ-jH7Q"]}},"prod-MZvj9Dzw":{"IsCharacterClass":{"clause":"22.2.1.5","ids":["prod-CyWYzaiY"]},"CharacterValue":{"clause":"22.2.1.6","ids":["prod-lioRfUCB"]},"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-y4BsoD9c"]}},"prod-A6KLgGNK":{"IsCharacterClass":{"clause":"22.2.1.5","ids":["prod-_jzYJMTx"]},"CharacterValue":{"clause":"22.2.1.6","ids":["prod-RssYfbc0"]},"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-dYEaUVMZ"]}},"prod-NKSKjwBB":{"IsCharacterClass":{"clause":"22.2.1.5","ids":["prod-Z3nmWONm"]},"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod--6UgQqmj"]}},"prod-pRiuVk3t":{"IsCharacterClass":{"clause":"22.2.1.5","ids":["prod-3d9phfMH"]}},"prod-q4aq35sO":{"CharacterValue":{"clause":"22.2.1.6","ids":["prod-qdZp22xs"]}},"prod-lMmOF-9c":{"CharacterValue":{"clause":"22.2.1.6","ids":["prod-OO2zEPPr"]}},"prod-oPPhk0pZ":{"CharacterValue":{"clause":"22.2.1.6","ids":["prod--h1KYMFX"]}},"prod-CrHLbIYs":{"CharacterValue":{"clause":"22.2.1.6","ids":["prod-GXRVwMQi"]}},"prod-8GU45ufS":{"CharacterValue":{"clause":"22.2.1.6","ids":["prod-xQFw7WMV"]}},"prod-5oXd8wzV":{"CharacterValue":{"clause":"22.2.1.6","ids":["prod-OI8ASjmd"]}},"prod-CzkVQCuc":{"CharacterValue":{"clause":"22.2.1.6","ids":["prod-cC4Huuek"]}},"prod-AEZ_iyDC":{"CharacterValue":{"clause":"22.2.1.6","ids":["prod-KB9TwXt5"]}},"prod-aZFqSbDx":{"CharacterValue":{"clause":"22.2.1.6","ids":["prod-w_eLE8Wq"]}},"prod-YFxZ-zB2":{"CharacterValue":{"clause":"22.2.1.6","ids":["prod-gm_vpVWn"]}},"prod-VtjEN4lt":{"CharacterValue":{"clause":"22.2.1.6","ids":["prod-u6hqoUgl"]}},"prod-CieYjAI6":{"CapturingGroupName":{"clause":"22.2.1.8","ids":["prod-n_is87x3"]}},"prod-UEFofPmM":{"RegExpIdentifierCodePoints":{"clause":"22.2.1.9","ids":["prod-MLgOzB7a"]}},"prod-Wlj6DCQi":{"RegExpIdentifierCodePoints":{"clause":"22.2.1.9","ids":["prod-s0FAcATI"]}},"prod-ChPpokvC":{"RegExpIdentifierCodePoint":{"clause":"22.2.1.10","ids":["prod-KawRYiQy"]}},"prod-QEKJWJ5I":{"RegExpIdentifierCodePoint":{"clause":"22.2.1.10","ids":["prod-hbCPVPTo"]}},"prod-gHtf4gFI":{"RegExpIdentifierCodePoint":{"clause":"22.2.1.10","ids":["prod-3xUUqpuD"]}},"prod-tb_1J4i8":{"RegExpIdentifierCodePoint":{"clause":"22.2.1.10","ids":["prod-qsRdhrnd"]}},"prod-WBQHipLA":{"RegExpIdentifierCodePoint":{"clause":"22.2.1.10","ids":["prod-rk-_SuFT"]}},"prod-NsruFaTJ":{"RegExpIdentifierCodePoint":{"clause":"22.2.1.10","ids":["prod-NowIa6nU"]}},"prod-B7AwVhmt":{"CompilePattern":{"clause":"22.2.2.2","ids":["prod-mHyeO4wo"]}},"prod-MCRqOZOt":{"CompileSubpattern":{"clause":"22.2.2.3","ids":["prod-y4rdvkKA"]}},"prod-59aIYYAE":{"CompileSubpattern":{"clause":"22.2.2.3","ids":["prod-DxcBBSWc"]}},"prod-AWMX5oRX":{"CompileSubpattern":{"clause":"22.2.2.3","ids":["prod-fiPiStf_"]}},"prod-R1uQAeY_":{"CompileSubpattern":{"clause":"22.2.2.3","ids":["prod-tmSpn0_R"]}},"prod-j_jePxdh":{"CompileSubpattern":{"clause":"22.2.2.3","ids":["prod-fNHoehtY"]}},"prod-FwIStaHw":{"CompileSubpattern":{"clause":"22.2.2.3","ids":["prod-LaYcA3Qv"]}},"prod--UK1vL-o":{"CompileAssertion":{"clause":"22.2.2.4","ids":["prod-sVm_wok4"]}},"prod-2McWu3FN":{"CompileAssertion":{"clause":"22.2.2.4","ids":["prod-STP3aqEM"]}},"prod-dGY5m3B5":{"CompileAssertion":{"clause":"22.2.2.4","ids":["prod-ViPM0g4q"]}},"prod-cEq5EQ6K":{"CompileAssertion":{"clause":"22.2.2.4","ids":["prod-zZ_Qgb0r"]}},"prod-Cf1SEDgB":{"CompileAssertion":{"clause":"22.2.2.4","ids":["prod-K3dw8gDB"]}},"prod-FyT9myEt":{"CompileAssertion":{"clause":"22.2.2.4","ids":["prod-aFJAHEX0"]}},"prod-haZS2dRF":{"CompileAssertion":{"clause":"22.2.2.4","ids":["prod-ITDs20e0"]}},"prod-ITKxHdqR":{"CompileAssertion":{"clause":"22.2.2.4","ids":["prod-Oce7U7TP"]}},"prod-tUDOOFuV":{"CompileQuantifier":{"clause":"22.2.2.5","ids":["prod-9qV9mwu-"]}},"prod-GZavMceB":{"CompileQuantifier":{"clause":"22.2.2.5","ids":["prod-qWoBDE8M"]}},"prod-vLv9dnb5":{"CompileQuantifierPrefix":{"clause":"22.2.2.6","ids":["prod-s8nl1xnS"]}},"prod-UgDebVXB":{"CompileQuantifierPrefix":{"clause":"22.2.2.6","ids":["prod-4GxjzerI"]}},"prod-N4RBWkLM":{"CompileQuantifierPrefix":{"clause":"22.2.2.6","ids":["prod-xg-YUvEA"]}},"prod-kgxh0ghk":{"CompileQuantifierPrefix":{"clause":"22.2.2.6","ids":["prod-cx_RnfxU"]}},"prod-jfh41CSR":{"CompileQuantifierPrefix":{"clause":"22.2.2.6","ids":["prod--bNWqStu"]}},"prod-bLgfIwO4":{"CompileQuantifierPrefix":{"clause":"22.2.2.6","ids":["prod-JGD-kmEs"]}},"prod-hYVkAeML":{"CompileAtom":{"clause":"22.2.2.7","ids":["prod-Js9cL8Bl"]}},"prod-6UeGTTDU":{"CompileAtom":{"clause":"22.2.2.7","ids":["prod-HeZ4ZCvZ"]}},"prod-gdPiaYp4":{"CompileAtom":{"clause":"22.2.2.7","ids":["prod-lKfl4ziO"]}},"prod-XC-6aJgH":{"CompileAtom":{"clause":"22.2.2.7","ids":["prod-rOrnsPez"]}},"prod-eFQJZCbr":{"CompileAtom":{"clause":"22.2.2.7","ids":["prod-G6MNAyJ9"]}},"prod-2qcgA24q":{"CompileAtom":{"clause":"22.2.2.7","ids":["prod-cCYT06VF"]}},"prod-sBosbs9Q":{"CompileAtom":{"clause":"22.2.2.7","ids":["prod-HH-Xi2Q_"]}},"prod-QZtCcvYH":{"CompileAtom":{"clause":"22.2.2.7","ids":["prod-k2ESRh0v"]}},"prod-JlQXbw31":{"CompileAtom":{"clause":"22.2.2.7","ids":["prod-VB-OogXI"]}},"prod-bczcwPHe":{"CompileCharacterClass":{"clause":"22.2.2.8","ids":["prod-SO4ILMRd"]}},"prod-Jv4TFSLc":{"CompileCharacterClass":{"clause":"22.2.2.8","ids":["prod-g364uoyk"]}},"prod-SkuwrFQT":{"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-shxjwMBA"]}},"prod-8-K7AdXe":{"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-v8F30MhJ"]}},"prod-EbHYacpU":{"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-v1CuPiBp"]}},"prod-MjoVem1x":{"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-F2f_obS_"]}},"prod-wzvB1IdY":{"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-vPkwtM-0"]}},"prod-SeTTaRwS":{"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-E23U4UCW"]}},"prod-JQe22hGV":{"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-CJ70Staj"]}},"prod-Ba3BrqMI":{"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-4qp2L35t"]}},"prod-mC3Wqo02":{"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-sOQsJGFN"]}},"prod-uRZ9YD5P":{"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-yVuyKzZ7"]}},"prod-tSKKQe8i":{"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-3TNl1K-Z"]}},"prod-5iubKlkQ":{"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-kc86cCn-"]}},"prod-LRNY7pYO":{"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-rM2HtPxJ"]}},"prod-wlk0gl-x":{"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-5_vYUeM-"]}},"prod-jMQ5xe2C":{"CompileToCharSet":{"clause":"22.2.2.9","ids":["prod-JU4eVWl0"]}}}`);
;let usesMultipage = true