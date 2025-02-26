import { WhisperSegment, WhisperWord } from "../src/services/scriptProcessor";

/**
 * Generate an SRT file with word-by-word synchronization
 */
export function generateSRT(segments: WhisperSegment[]): string {
  if (!Array.isArray(segments) || segments.length === 0) {
    console.error('Invalid segments provided to generateSRT:', segments);
    return '';
  }

  let srtContent = '';
  let index = 1;

  for (const segment of segments) {
    // Si pas de words, utiliser le segment entier
    if (!segment.words || segment.words.length === 0) {
      const text = segment.text.toUpperCase().trim();
      if (text) {
        // Découper le texte en groupes de mots si nécessaire
        const words = text.split(' ').map(word => ({
          word,
          start: segment.start,
          end: segment.end
        }));
        const wordGroups = splitIntoOptimalGroups(words);
        
        for (const group of wordGroups) {
          srtContent += `${index}\n${formatTime(segment.start)} --> ${formatTime(segment.end)}\n${group.map(w => w.word).join(' ')}\n\n`;
          index++;
        }
      }
      continue;
    }

    // Découper le segment en groupes de mots optimaux
    const wordGroups = splitIntoOptimalGroups(segment.words as WhisperWord[]);

    for (const group of wordGroups) {
      const startTime = formatTime(group[0].start);
      const endTime = formatTime(group[group.length - 1].end);
      const text = group.map(w => w.word.toUpperCase()).join(' ');

      srtContent += `${index}\n${startTime} --> ${endTime}\n${text}\n\n`;
      index++;
    }
  }

  return srtContent;
}

/**
 * Converts a time (in seconds) to SRT time format: HH:MM:SS,ms
 */
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function pad(num: number, size: number = 2): string {
  let s = num.toString();
  while (s.length < size) s = "0" + s;
  return s;
}

// Fonction pour découper une phrase en groupes de mots optimaux
function splitIntoOptimalGroups(words: WhisperWord[]): WhisperWord[][] {
  const MAX_CHARS_PER_LINE = 20; // Maximum de caractères par ligne pour format vertical
  const groups: WhisperWord[][] = [];
  let currentGroup: WhisperWord[] = [];
  let currentLength = 0;

  for (const word of words) {
    // Ajouter un espace si ce n'est pas le premier mot
    const spaceNeeded = currentGroup.length > 0 ? 1 : 0;
    
    // Si l'ajout du mot dépasse la limite, créer un nouveau groupe
    if (currentLength + spaceNeeded + word.word.length > MAX_CHARS_PER_LINE && currentGroup.length > 0) {
      groups.push(currentGroup);
      currentGroup = [word];
      currentLength = word.word.length;
    } else {
      currentGroup.push(word);
      currentLength += spaceNeeded + word.word.length;
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
} 