/**
 * Données du cartel et des diapositives.
 * Source unique de vérité : modifier ici se reflète dans le DOM généré.
 *
 * @typedef {Object} Entry
 * @property {string}   title     Titre de l'objet (peut contenir un retour à la ligne souple via \n)
 * @property {string}   source    Provenance (collection, don…)
 * @property {string}   ref       Numéro de référence (formaté avec espaces fines si besoin)
 * @property {number}   tilt      Inclinaison décorative en "demi-degrés" (multiplié par 0.3deg en CSS)
 * @property {boolean} [leftAlign] Si vrai, titre aligné à gauche (cas du dernier item, plus long)
 *
 * @typedef {Object} Slide
 * @property {'left'|'right'} dir   Côté d'apparition
 * @property {'video'|'audio'} type Type de média
 * @property {string} src           Source du média
 * @property {string} thumb         Image miniature (toujours visible au repos)
 * @property {string} caption       Légende sous la diapo
 * @property {number} tilt          Inclinaison en degrés
 * @property {string} top           Position verticale en % (CSS)
 */

/** @type {Entry[]} */
export const entries = [
    { title: "Masai du Tanganyika",                                    source: "Coll. Dècle",                  ref: "9 969",  tilt: -1   },
    { title: "Squelette d'Abyssin",                                    source: "Don de la Ville de Paris",     ref: "17 627", tilt:  1   },
    { title: "Squelette d'Arabe d'Alger",                              source: "Coll. Guyon",                  ref: "775",    tilt: -0.5 },
    { title: "Crâne (présumé de Cartouche)",                           source: "Don de la Biblioth. Ste Geneviève", ref: "24 860", tilt: 0.8 },
    { title: "Squelette de Soliman, assassin du Gé-\nnéral Kléber",    source: "Coll. Baron Larrey",           ref: "3 605",  tilt:  0, leftAlign: true },
];

/** @type {Slide[]} */
export const slides = [
    {
        dir: "left",
        type: "video",
        src: "chp2-medias/l-Abribus.mp4",
        thumb: "chp2-images/l-Abribus.png",
        caption: "L'Abribus",
        tilt: -8,
        top: "13%",
    },
    {
        dir: "left",
        type: "video",
        src: "chp2-medias/les-corps-de-la-guerre.mp4",
        thumb: "chp2-images/les-corps-de-la-guerre.png",
        caption: "Les corps de la guerre",
        tilt: -4,
        top: "53%",
    },
    {
        dir: "right",
        type: "audio",
        src: "chp2-medias/temoignage-guillaume-auxence.mp3",
        thumb: "chp2-images/temoignage-guillaume.png",
        caption: "Témoignage Guillaume-Auxence",
        tilt: 6,
        top: "31%",
    },
];
