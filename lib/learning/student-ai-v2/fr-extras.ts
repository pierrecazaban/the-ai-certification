import type { GlossaryEntry, ModuleVideo } from '../types';

// Compléments des modules en français (24/11), demandés après trois avis d'élèves (« des vidéos ou des fascicules
// pour approfondir », « problèmes sur Make », « cas pratiques à mieux expliquer ») :
//  - videos : deux vidéos YouTube en français par module, contrôlées une par une (existence, durée, chapitres). Ce sont
//    des liens : jamais de lecteur intégré, les règles de YouTube interdisent de faire payer pour en regarder un.
//  - glossary : les mots à retenir, repris dans le fascicule du module et connus de l'assistant du cours.
// Les vidéos de la version anglaise sont d'autres vidéos (en-extras.ts) : lib/learning/index.ts le vérifie.

export const extras: Record<string, { videos: ModuleVideo[]; glossary: GlossaryEntry[] }> = {
  'v2-m1': {
    videos: [
      { id: '7ell8KEbhJo', title: 'Ce qui se cache derrière le fonctionnement de ChatGPT', channel: 'ScienceEtonnante', minutes: 27,
        why: 'Tout le module en images : prédiction du mot suivant, tokens, vecteurs et attention.' },
      { id: 'xXHWTC4mJBM', title: 'Quelles sont les limites de ChatGPT ?', channel: 'Inria', minutes: 7,
        why: 'Biais, connaissances figées, hallucinations : les limites de la leçon 3, par des chercheurs.' },
    ],
    glossary: [
      { term: 'Token', def: 'Morceau de texte (mot, partie de mot, ponctuation) que le modèle manipule. C’est l’unité de la facturation et de la limite de contexte.' },
      { term: 'Vecteur (embedding)', def: 'Liste de nombres qui représente un token, une phrase ou un document. Deux sens proches donnent des vecteurs proches.' },
      { term: 'Similarité cosinus', def: 'Mesure de proximité entre deux vecteurs : proche de 1, les sens sont voisins ; proche de 0, ils n’ont aucun rapport.' },
      { term: 'Poids (paramètres)', def: 'Les milliards de nombres réglés pendant l’entraînement. Ils contiennent tout ce que le modèle « sait ».' },
      { term: 'Pré-entraînement', def: 'Première phase : le modèle apprend à deviner le token suivant sur d’énormes quantités de texte.' },
      { term: 'Fine-tuning', def: 'Ajustement du modèle sur des exemples choisis, par exemple des questions et leurs bonnes réponses.' },
      { term: 'RLHF', def: 'Ajustement à partir de préférences humaines : des personnes comparent plusieurs réponses et indiquent la meilleure.' },
      { term: 'Température', def: 'Réglage du hasard dans le choix du token suivant. Basse : réponses stables. Haute : réponses variées, plus risquées.' },
      { term: 'Hallucination', def: 'Réponse plausible mais fausse, produite quand l’information manque : le modèle vise le vraisemblable, pas le vérifié.' },
      { term: 'Fenêtre de contexte', def: 'Nombre maximal de tokens traités à la fois : consignes, historique, documents collés et réponse en cours.' },
      { term: 'Attention', def: 'Mécanisme qui pondère l’importance de chaque token du contexte pour produire le suivant. Le cœur des Transformers.' },
      { term: 'Date de connaissance', def: 'Date où s’arrêtent les données d’entraînement. Sans recherche web, le modèle ignore ce qui s’est passé après.' },
    ],
  },
  'v2-m2': {
    videos: [
      { id: '5rv0OTRr6eE', title: 'Vos prompts sont morts, j’ai découvert le Prompt Parfait !', channel: 'Elliott Pierret', minutes: 18,
        why: 'Rôle, tâche, contexte, format, contraintes : les cinq règles d’un bon prompt, avec des exemples.' },
      { id: '5V3t7YXYjZc', title: 'RAG expliqué simplement : la technique derrière les IA qui marchent', channel: 'Projets IA', minutes: 21,
        why: 'Le RAG étape par étape, sans une ligne de code, et pourquoi il se trompe parfois.' },
    ],
    glossary: [
      { term: 'Prompt système', def: 'Les consignes permanentes données au modèle : rôle et objectif, contexte, méthode, règles, format de sortie.' },
      { term: 'Few-shot', def: 'Donner dans le prompt deux ou trois exemples d’entrée et de sortie attendue : le modèle reproduit la structure.' },
      { term: 'Sortie structurée', def: 'Réponse dans un format fixe qu’un logiciel peut réutiliser, le plus souvent du JSON avec des champs définis.' },
      { term: 'JSON', def: 'Format de données en champs nommés (« entreprise », « score »…), compris par les tableurs, les CRM et les outils d’automatisation.' },
      { term: 'Mode JSON', def: 'Option de beaucoup d’outils qui impose le format ou un schéma : elle élimine la plupart des réponses mal formées.' },
      { term: 'INCONNU', def: 'Valeur de repli à demander quand l’information manque, pour que le modèle ne l’invente pas.' },
      { term: 'RAG', def: 'Génération augmentée par la recherche : on retrouve les passages utiles de tes documents et le modèle répond à partir d’eux.' },
      { term: 'Chunk', def: 'Morceau de document de quelques centaines de tokens, découpé pour la recherche.' },
      { term: 'Base vectorielle', def: 'Base de données qui range les vecteurs des morceaux et retrouve ceux qui sont les plus proches d’une question.' },
      { term: 'Fine-tuning', def: 'Ré-entraîner le modèle sur tes exemples pour changer un style ou un comportement. Pas pour ajouter des faits qui changent souvent.' },
    ],
  },
  'v2-m3': {
    videos: [
      { id: '1auRbtW3b3s', title: 'Comprendre les Agents IA en 10 minutes', channel: 'theyo', minutes: 10,
        why: 'Assistant, automatisation, agent : les trois niveaux de la leçon 1, avec des exemples.' },
      { id: 'fJIT3ix4X6k', title: 'Formation Make.com 2025 : tutoriel complet + AI Agents', channel: 'JCBuildsAI', minutes: 36,
        why: 'Make pas à pas : compte gratuit, scénario avec Google Sheets, filtres et routeur. À voir avant l’exercice.' },
    ],
    glossary: [
      { term: 'Chatbot', def: 'Répond à des messages. Il ne fait que produire du texte.' },
      { term: 'Workflow', def: 'Enchaînement d’étapes fixées à l’avance : c’est toi qui décides l’ordre, le modèle exécute une étape.' },
      { term: 'Agent', def: 'Reçoit un objectif et des outils, choisit lui-même les étapes, observe le résultat et recommence jusqu’à avoir fini.' },
      { term: 'Appel d’outils', def: 'Le modèle demande, sous forme structurée, d’exécuter un outil ; l’application l’exécute et lui renvoie le résultat.' },
      { term: 'MCP', def: 'Model Context Protocol : standard ouvert pour brancher les mêmes outils sur n’importe quel assistant compatible.' },
      { term: 'Scénario', def: 'Dans Make, une automatisation construite en reliant des modules, sans écrire de code.' },
      { term: 'Déclencheur', def: 'Ce qui lance le scénario : une nouvelle ligne de tableur, un email, un formulaire, une heure fixe.' },
      { term: 'Module', def: 'Une étape du scénario : appeler un modèle d’IA, écrire dans Google Sheets, envoyer un message.' },
      { term: 'Mappage', def: 'Faire passer une donnée d’une étape à la suivante : le champ « entreprise » du JSON devient une colonne du tableur.' },
      { term: 'Filtre et routeur', def: 'Le filtre laisse passer seulement si une condition est vraie ; le routeur envoie vers des branches différentes.' },
      { term: 'Opération', def: 'Unité consommée à chaque exécution d’un module dans Make. À surveiller, comme les tokens du modèle.' },
      { term: 'Injection de prompt', def: 'Texte piégé, dans un email ou une page web, qui tente de donner des instructions au modèle qui le lit.' },
      { term: 'Moindre privilège', def: 'Ne donner à l’agent que les outils et les droits strictement nécessaires à sa tâche.' },
      { term: 'Minimisation', def: 'Principe du RGPD : n’envoyer au modèle que les données nécessaires à la tâche.' },
    ],
  },
  'v2-m4': {
    videos: [
      { id: 'X43nD5pZ2LM', title: 'J’ai testé les 9 modules IA de Make (tuto + cas concrets)', channel: 'Claire no-code', minutes: 18,
        why: 'L’étape d’IA de ton projet sans clé API : extraire des champs, donner un score, catégoriser.' },
      { id: 'okuX42UXcjQ', title: 'Le coût des tokens : combien coûte vraiment un LLM (et comment l’estimer)', channel: 'Projets IA', minutes: 14,
        why: 'La méthode pour estimer le coût de 100 exécutions, demandé dans ton projet.' },
    ],
    glossary: [
      { term: 'Parcours', def: 'Le projet le plus proche de ton futur métier : business, finance, ingénieur ou marketing.' },
      { term: 'Étape d’IA en JSON', def: 'L’étape où le modèle produit des champs fixes, que les étapes suivantes du workflow réutilisent.' },
      { term: 'Validation humaine', def: 'Étape où une personne approuve avant toute action externe : envoyer, publier, payer.' },
      { term: 'Cas de test', def: 'Trois essais à faire : un cas normal, un cas où une information manque, un cas piégé.' },
      { term: 'Cas limite', def: 'Situation inhabituelle que le workflow doit gérer : information manquante, contenu ambigu, tentative d’injection.' },
      { term: 'Grille', def: 'Les cinq critères d’un bon projet : il fonctionne de bout en bout, sa sortie est exploitable, les cas limites sont gérés, les risques sont maîtrisés, la valeur métier est claire.' },
      { term: 'Coût pour 100 exécutions', def: 'Opérations de l’outil d’automatisation et tokens du modèle, multipliés par le nombre d’exécutions.' },
      { term: 'Valeur métier', def: 'Ce que le workflow apporte vraiment : le temps gagné, la décision rendue plus facile.' },
    ],
  },
};
