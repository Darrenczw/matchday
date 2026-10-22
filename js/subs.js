// Each team's own subreddit, for Fans > Your teams (PRD-ftltg 7.5). Keyed by sport and ESPN's team name.
// Only subreddits known for sure: the helper asks for all of them in one combined feed, and a wrong name there
// could spoil it for everyone. A team that isn't listed shows its match threads only.
const SOCCER = {
  'Arsenal': 'Gunners', 'Aston Villa': 'avfc', 'AFC Bournemouth': 'AFCBournemouth', 'Brentford': 'Brentford',
  'Brighton & Hove Albion': 'BrightonHoveAlbion', 'Chelsea': 'chelseafc', 'Crystal Palace': 'crystalpalace', 'Everton': 'Everton',
  'Fulham': 'FulhamFC', 'Liverpool': 'LiverpoolFC', 'Manchester City': 'MCFC', 'Manchester United': 'reddevils',
  'Newcastle United': 'NUFC', 'Nottingham Forest': 'nffc', 'Tottenham Hotspur': 'coys', 'West Ham United': 'Hammers',
  'Wolverhampton Wanderers': 'WWFC', 'Leeds United': 'LeedsUnited', 'Sunderland': 'safc', 'Burnley': 'Burnley',
  'Barcelona': 'Barca', 'Real Madrid': 'realmadrid', 'Atlético Madrid': 'atletico', 'Bayern Munich': 'fcbayern',
  'Borussia Dortmund': 'borussiadortmund', 'Juventus': 'Juve', 'AC Milan': 'ACMilan', 'Internazionale': 'FCInterMilan',
  'Paris Saint-Germain': 'psg', 'Celtic': 'CelticFC', 'Rangers': 'rangersfc',
};
const NFL = {
  'Arizona Cardinals': 'AZCardinals', 'Atlanta Falcons': 'falcons', 'Baltimore Ravens': 'ravens', 'Buffalo Bills': 'buffalobills',
  'Carolina Panthers': 'panthers', 'Chicago Bears': 'CHIBears', 'Cincinnati Bengals': 'bengals', 'Cleveland Browns': 'Browns',
  'Dallas Cowboys': 'cowboys', 'Denver Broncos': 'DenverBroncos', 'Detroit Lions': 'detroitlions', 'Green Bay Packers': 'GreenBayPackers',
  'Houston Texans': 'Texans', 'Indianapolis Colts': 'Colts', 'Jacksonville Jaguars': 'Jaguars', 'Kansas City Chiefs': 'KansasCityChiefs',
  'Las Vegas Raiders': 'raiders', 'Los Angeles Chargers': 'Chargers', 'Los Angeles Rams': 'LosAngelesRams', 'Miami Dolphins': 'miamidolphins',
  'Minnesota Vikings': 'minnesotavikings', 'New England Patriots': 'Patriots', 'New Orleans Saints': 'Saints', 'New York Giants': 'NYGiants',
  'New York Jets': 'nyjets', 'Philadelphia Eagles': 'eagles', 'Pittsburgh Steelers': 'steelers', 'San Francisco 49ers': '49ers',
  'Seattle Seahawks': 'Seahawks', 'Tampa Bay Buccaneers': 'buccaneers', 'Tennessee Titans': 'Tennesseetitans', 'Washington Commanders': 'Commanders',
};
const NBA = {
  'Atlanta Hawks': 'AtlantaHawks', 'Boston Celtics': 'bostonceltics', 'Brooklyn Nets': 'GoNets', 'Charlotte Hornets': 'CharlotteHornets',
  'Chicago Bulls': 'chicagobulls', 'Cleveland Cavaliers': 'clevelandcavs', 'Dallas Mavericks': 'Mavericks', 'Denver Nuggets': 'denvernuggets',
  'Detroit Pistons': 'DetroitPistons', 'Golden State Warriors': 'warriors', 'Houston Rockets': 'rockets', 'Indiana Pacers': 'pacers',
  'LA Clippers': 'LAClippers', 'Los Angeles Lakers': 'lakers', 'Memphis Grizzlies': 'memphisgrizzlies', 'Miami Heat': 'heat',
  'Milwaukee Bucks': 'MkeBucks', 'Minnesota Timberwolves': 'timberwolves', 'New Orleans Pelicans': 'NOLAPelicans', 'New York Knicks': 'NYKnicks',
  'Oklahoma City Thunder': 'Thunder', 'Orlando Magic': 'OrlandoMagic', 'Philadelphia 76ers': 'sixers', 'Phoenix Suns': 'suns',
  'Portland Trail Blazers': 'ripcity', 'Sacramento Kings': 'kings', 'San Antonio Spurs': 'NBASpurs', 'Toronto Raptors': 'torontoraptors',
  'Utah Jazz': 'UtahJazz', 'Washington Wizards': 'washingtonwizards',
};
const BY = { soccer: SOCCER, football: NFL, basketball: NBA };
export const subOf = (sport, name) => BY[sport]?.[name] || '';
