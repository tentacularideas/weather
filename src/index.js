const ICAL = require('ical.js');
const fs = require('fs');

class DailyForecast {
  date;
  icon;
  description;
  temperatureMin;
  temperatureMax;

  constructor(date, icon, description, temperatureMin, temperatureMax) {
    this.date = date;
    this.icon = icon;
    this.description = description;
    this.temperatureMin = temperatureMin;
    this.temperatureMax = temperatureMax;
  }
}

class Weatherbit {
  static #codes = new Map([
    [200, { icon: "⛈️", description: "Thunderstorm with light rain" }],
    [201, { icon: "⛈️", description: "Thunderstorm with rain" }],
    [202, { icon: "⛈️", description: "Thunderstorm with heavy rain" }],
    [230, { icon: "⛈️", description: "Thunderstorm with light drizzle" }],
    [231, { icon: "⛈️", description: "Thunderstorm with drizzle" }],
    [232, { icon: "⛈️", description: "Thunderstorm with heavy drizzle" }],
    [233, { icon: "🌨️", description: "Thunderstorm with Hail" }],
    [300, { icon: "🌧️", description: "Light Drizzle" }],
    [301, { icon: "🌧️", description: "Drizzle" }],
    [302, { icon: "🌧️", description: "Heavy Drizzle" }],
    [500, { icon: "🌧️", description: "Light Rain" }],
    [501, { icon: "🌧️", description: "Moderate Rain" }],
    [502, { icon: "🌧️", description: "Heavy Rain" }],
    [511, { icon: "🌧️", description: "Freezing rain" }],
    [520, { icon: "🌧️", description: "Light shower rain" }],
    [521, { icon: "🌧️", description: "Shower rain" }],
    [522, { icon: "🌧️", description: "Heavy shower rain" }],
    [600, { icon: "🌨️", description: "Light snow" }],
    [601, { icon: "🌨️", description: "Snow" }],
    [602, { icon: "🌨️", description: "Heavy Snow" }],
    [610, { icon: "🌨️", description: "Mix snow/rain" }],
    [611, { icon: "🌨️", description: "Sleet" }],
    [612, { icon: "🌨️", description: "Heavy sleet" }],
    [621, { icon: "🌨️", description: "Snow shower" }],
    [622, { icon: "🌨️", description: "Heavy snow shower" }],
    [623, { icon: "🌨️", description: "Flurries" }],
    [700, { icon: "🌫️", description: "Mist" }],
    [711, { icon: "🌫️", description: "Smoke" }],
    [721, { icon: "🌫️", description: "Haze" }],
    [731, { icon: "🌫️", description: "Sand/dust" }],
    [741, { icon: "🌫️", description: "Fog" }],
    [751, { icon: "🌫️", description: "Freezing Fog" }],
    [800, { icon: "☀️", description: "Clear sky" }],
    [801, { icon: "🌤️", description: "Few clouds" }],
    [802, { icon: "⛅", description: "Scattered clouds" }],
    [803, { icon: "🌥️", description: "Broken clouds" }],
    [804, { icon: "☁️", description: "Overcast clouds" }],
    [900, { icon: "❓", description: "Unknown Precipitation" }],
  ]);

  static getWeather(code) {
    return this.#codes.get(code);
  }

  static async getForecast() {
    const apiKey = process.env.API_KEY;
    const latitude = process.env.LATITUDE;
    const longitude = process.env.LONGITUDE;

    console.log(`Retrieving forecast on latitude ${latitude}, longitude ${longitude} with API key "${apiKey}".`);
  
    const url = new URL("/v2.0/forecast/daily", "https://api.weatherbit.io");
    url.searchParams.set("lat", latitude);
    url.searchParams.set("lon", longitude);
    url.searchParams.set("days", 7);
    url.searchParams.set("key", apiKey);
    
    const response = await fetch(url);
    const data = await response.json();
  
    return data.data.map(day => {
      const weather = Weatherbit.getWeather(day.weather.code);

      return new DailyForecast(
        new Date(day.datetime),
        weather.icon,
        weather.description,
        day.min_temp,
        day.max_temp,
      );
    });
  }
}

function updateIcs(forecast) {
  const path = "./public/weather.ics";
  const productId = process.env.GITHUB_REPOSITORY;
  const latitude = parseFloat(process.env.LATITUDE);
  const longitude = parseFloat(process.env.LONGITUDE);

  // Create or load calendar
  let jcalData;
  try {
    if (fs.existsSync(path)) {
      const fileContent = fs.readFileSync(path, 'utf8');
      jcalData = ICAL.parse(fileContent);
    }
  } catch (error) {
    console.error('Error reading existing ICS file:', error);
  }

  // Create new calendar if none exists
  if (!jcalData) {
    jcalData = [
      "vcalendar",
      [
        ["prodid", {}, "text", `-//${productId}//Weather Calendar//EN`],
        ["version", {}, "text", "2.0"],
        ["calscale", {}, "text", "GREGORIAN"]
      ],
      []
    ];
  }

  const vcalendar = new ICAL.Component(jcalData);
  
  // Remove old events (older than 2 weeks)
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  
  const existingEvents = vcalendar.getAllSubcomponents('vevent');
  existingEvents.forEach(event => {
    const eventDate = new Date(event.getFirstPropertyValue('dtstart'));
    if (eventDate < twoWeeksAgo) {
      vcalendar.removeSubcomponent(event);
    }
  });

  // Add or update forecast events
  forecast.forEach(day => {
    const uid = `Weather#${Math.floor(day.date.getTime() / 1000)}`;
    const existingEvent = vcalendar.getFirstSubcomponent('vevent', event => 
      event.getFirstPropertyValue('uid') === uid
    );

    if (existingEvent) {
      vcalendar.removeSubcomponent(existingEvent);
    }

    const vevent = new ICAL.Component('vevent');
    const endDate = new Date(day.date);
    endDate.setDate(endDate.getDate() + 1);

    vevent.addPropertyWithValue('uid', uid);
    vevent.addPropertyWithValue('dtstamp', ICAL.Time.now());
    vevent.addPropertyWithValue('dtstart', ICAL.Time.fromJSDate(day.date, true));
    vevent.addPropertyWithValue('dtend', ICAL.Time.fromJSDate(endDate, true));
    vevent.addPropertyWithValue('summary', 
      `${day.icon} ${day.temperatureMin.toFixed(1)}°C/${day.temperatureMax.toFixed(1)}°C`
    );
    vevent.addPropertyWithValue('description',
      `${day.description}, Min: ${day.temperatureMin.toFixed(1)}°C, Max: ${day.temperatureMax.toFixed(1)}°C`
    );
    vevent.addPropertyWithValue('geo', `${latitude};${longitude}`);

    vcalendar.addSubcomponent(vevent);
  });

  // Save to file
  fs.writeFileSync(path, vcalendar.toString());
}

async function main() {
  updateIcs(await Weatherbit.getForecast());
}

main();