// Automated Test Suite for Badminton Doubles Scheduler
const assert = require('assert');

// Extract the core functions to test
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function orderTeamMatches(numTeams) {
  const allPairs = [];
  for (let i = 0; i < numTeams; i++) {
    for (let j = i + 1; j < numTeams; j++) {
      allPairs.push({ a: i, b: j, s: 0 });
    }
  }

  if (allPairs.length <= 1) return allPairs;

  const remaining = [...allPairs];
  const ordered = [];
  const lastPlayed = new Array(numTeams).fill(-999);

  while (remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    const currentStep = ordered.length;
    const prevMatch = ordered[ordered.length - 1];

    for (let idx = 0; idx < remaining.length; idx++) {
      const m = remaining[idx];
      let score = 0;

      const overlapPrev = prevMatch && (
        m.a === prevMatch.a || m.a === prevMatch.b ||
        m.b === prevMatch.a || m.b === prevMatch.b
      );

      if (overlapPrev) {
        score -= 10000;
      }

      const restA = currentStep - lastPlayed[m.a];
      const restB = currentStep - lastPlayed[m.b];
      const minRest = Math.min(restA, restB);
      const totalRest = restA + restB;
      score += minRest * 50 + totalRest;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    }

    const picked = remaining.splice(bestIdx, 1)[0];
    ordered.push(picked);
    lastPlayed[picked.a] = currentStep;
    lastPlayed[picked.b] = currentStep;
  }

  return ordered;
}

function generateCircleRounds(playerNames) {
  const n = playerNames.length;
  if (n < 4) return [];

  const isOdd = n % 2 !== 0;
  const shuffled = shuffleArray(playerNames);

  const circle = isOdd ? [...shuffled, '__BYE__'] : [...shuffled];
  const m = circle.length;
  const totalRounds = m - 1;

  const generatedRounds = [];

  for (let r = 0; r < totalRounds; r++) {
    const teams = [];
    const bye = [];

    for (let k = 0; k < m / 2; k++) {
      const p1 = circle[k];
      const p2 = circle[m - 1 - k];

      if (p1 === '__BYE__') {
        bye.push(p2);
      } else if (p2 === '__BYE__') {
        bye.push(p1);
      } else {
        teams.push([p1, p2]);
      }
    }

    const matches = orderTeamMatches(teams.length);

    generatedRounds.push({
      teams: teams,
      bye: bye,
      matches: matches
    });

    const fixed = circle[0];
    const rotating = circle.slice(1);
    const last = rotating.pop();
    rotating.unshift(last);
    circle.splice(0, circle.length, fixed, ...rotating);
  }

  return generatedRounds;
}

console.log('🏸 Running Badminton Doubles Scheduler Test Suite...\n');

const testCases = [4, 5, 6, 7, 8, 9, 10, 11, 12];

testCases.forEach(n => {
  const isOdd = n % 2 !== 0;
  const names = Array.from({ length: n }, (_, i) => `Player_${i + 1}`);
  const rounds = generateCircleRounds(names);

  const expectedRounds = isOdd ? n : n - 1;
  const expectedTeamsPerRound = isOdd ? (n - 1) / 2 : n / 2;
  const expectedMatchesPerRound = (expectedTeamsPerRound * (expectedTeamsPerRound - 1)) / 2;

  console.log(`Checking N = ${n} players (${isOdd ? 'Odd / with Byes' : 'Even / No Byes'}):`);
  assert.strictEqual(rounds.length, expectedRounds, `Rounds count should be ${expectedRounds}`);

  // 1. Partner Pairing Invariant: Every pair of players must partner exactly once!
  const partnerCounts = {};
  names.forEach(p1 => {
    partnerCounts[p1] = {};
    names.forEach(p2 => {
      if (p1 !== p2) partnerCounts[p1][p2] = 0;
    });
  });

  // 2. Bye Invariant: If odd, every player must get exactly 1 bye. If even, 0 byes.
  const byeCounts = {};
  names.forEach(p => byeCounts[p] = 0);

  rounds.forEach((round, rIdx) => {
    // Check teams count
    assert.strictEqual(round.teams.length, expectedTeamsPerRound, `Round ${rIdx + 1} team count mismatch`);
    
    // Check bye count
    if (isOdd) {
      assert.strictEqual(round.bye.length, 1, `Round ${rIdx + 1} should have exactly 1 bye`);
      byeCounts[round.bye[0]]++;
    } else {
      assert.strictEqual(round.bye.length, 0, `Round ${rIdx + 1} should have 0 byes`);
    }

    // Check matches count
    assert.strictEqual(round.matches.length, expectedMatchesPerRound, `Round ${rIdx + 1} matches count mismatch`);

    // Verify team round-robin: every team plays every other team exactly once
    const teamVersusCount = {};
    for (let i = 0; i < expectedTeamsPerRound; i++) {
      for (let j = i + 1; j < expectedTeamsPerRound; j++) {
        teamVersusCount[`${i}-${j}`] = 0;
      }
    }

    round.matches.forEach(m => {
      assert(m.a < m.b, 'Team a should be < Team b');
      assert(m.s === 0, 'Initial match status should be 0');
      const key = `${m.a}-${m.b}`;
      teamVersusCount[key] = (teamVersusCount[key] || 0) + 1;
    });

    Object.entries(teamVersusCount).forEach(([pair, count]) => {
      assert.strictEqual(count, 1, `Teams ${pair} must play each other exactly once in round ${rIdx + 1}`);
    });

    // Record partners
    round.teams.forEach(([p1, p2]) => {
      assert(p1 !== p2, 'Partner cannot be oneself');
      partnerCounts[p1][p2]++;
      partnerCounts[p2][p1]++;
    });
  });

  // Verify partner counts
  names.forEach(p1 => {
    names.forEach(p2 => {
      if (p1 < p2) {
        assert.strictEqual(partnerCounts[p1][p2], 1, `Players ${p1} and ${p2} must partner exactly once! Got ${partnerCounts[p1][p2]}`);
      }
    });
  });

  if (isOdd) {
    names.forEach(p => {
      assert.strictEqual(byeCounts[p], 1, `Player ${p} must have exactly 1 bye. Got ${byeCounts[p]}`);
    });
  }

  console.log(`  ✓ ${rounds.length} rounds generated`);
  console.log(`  ✓ All ${n * (n - 1) / 2} pairs partner together exactly once!`);
  if (isOdd) console.log(`  ✓ Every player gets exactly 1 bye!`);
  console.log(`  ✓ Every team plays every other team exactly once per round!\n`);
});

console.log('🎉 ALL TESTS PASSED! Scheduling rules are 100% structurally fair.');
