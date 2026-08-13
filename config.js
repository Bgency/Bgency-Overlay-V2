/*
  BGency Match Overlay V2
  IMPORTANT : mets ta clé API entre les guillemets.
  La clé reste sur ton PC et n'est jamais envoyée à BGency.
*/
const CONFIG = {
  API_KEY: "COLLE_TA_CLE_API_ICI",

  // Sochaux uniquement
  TEAM_SEARCH: "Sochaux",
  TIMEZONE: "Europe/Paris",

  // 120 s = ~60 requêtes pour 2 h de match.
  // À conserver pour l'instant afin d'éviter de consommer inutilement le quota.
  REFRESH_MS: 120000,

  // Événements du match affichés dans la colonne gauche.
  SHOW_EVENTS: true,

  // Classement.
  SHOW_STANDINGS: true,

  // Prochain match.
  SHOW_NEXT_MATCH: true,

  // Affiche une petite info de diagnostic uniquement si tu l'actives.
  DEBUG: false
};
