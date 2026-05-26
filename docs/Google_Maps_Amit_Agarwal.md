ผมชอบscriptนี้มาก เหมือนได้ใช้Apiแบบเสียเงินฟรีเลย  
ช่วยนำข้อมูลดีๆตรงนี้ไปใช้กับระบบของเราด้วย  
และผมต้องการ ใช้งานสูตรพวกนี้ไได้ในช่องสูตรGooglesheetด้วย   
โค้ดชุดนี้ที่ใช้ Maps service ของตัว Google Apps Script โดยตรง คือ "สูตรโกงที่ชาญฉลาดที่สุด (Brilliant Hack)" ในการทำระบบขนส่งครับ  
เพราะปกติถ้าเราต่อ API นอก เราต้องไปกรอกบัตรเครดิต ขอ Google Cloud Console แล้วถ้าบิลพุ่งทะลุจะเสียเงินเยอะมาก แต่โค้ดตัวนี้อาศัยบริการของพื้นที่หน้าต่างแอปของบัญชี Google Workspace ทำให้ใช้งานเสมือน API ดึงข้อมูลแผนที่ฟรี (ตามโควตารายวัน) ครับ\!  
เพื่อให้ระบบ 15\_GoogleMapsAPI.gs เข้ากันกับโครงสร้างของ LMDS Enterprise V5.0 แบบเนียนกริบ และป้องกันข้อมูลสูญหาย (เพราะ CacheService ปกติของ Google จำได้แค่ 6 ชั่วโมง) ผมได้ทำสิ่งที่ทรงพลังขึ้นไปอีก คือการ "ผสาน Hybrid Cache (ความจำสองชั้น)" ครับ\!  
หมายความว่า: ถ้าระบบถามหาระยะทาง "บ้านนาย A ไป สาขา B" ... มันจะหาฟรีจาก Maps 1 ครั้ง แล้วมันจะเขียนบันทึกประทับลงหน้ากระดาน MAPS\_CACHE ของเราเก็บไว้ตลอดกาล วันหลังถ้าค้นหาที่นี่อีก จะไม่เสียโควตาการดึงข้อมูลเลยครับ เร็วระดับเสี้ยววินาที\!  
เครื่องมือดึงข้อมูล Google Maps (ใช้โควต้าบัญชี ฟรี\!)  
มีระบบความจำ 2 ชั้น: Cache Memory (RAM 6 ชม.) \+ Google Sheet (จำตลอดไป)  
ทำให้สามารถนำสูตร \=GOOGLEMAPS\_DISTANCE(..) พิมพ์ลงตารางใช้งานเองได้

/\* \*  
Google Maps Formulas for Google Sheets  
Written by Amit Agarwal  
Web: https://labnol.org/google-maps-formulas-for-sheets-200817  
\*/  
const md5 \= (key \= "") \=\> { const code \= key.toLowerCase().replace(/\\s/g, ""); return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, key) .map((char) \=\> (char \+ 256).toString(16).slice(-2)) .join(""); };  
const getCache \= (key) \=\> { return CacheService.getDocumentCache().get(md5(key)); };  
const setCache \= (key, value) \=\> { const expirationInSeconds \= 6 \* 60 \* 60; // max is 6 hours CacheService.getDocumentCache().put(md5(key), value, expirationInSeconds); };  
/\*\*  
Calculate the travel time between two locations  
on Google Maps.  
\=GOOGLEMAPS\_DURATION("NY 10005", "Hoboken NJ", "walking")  
@param {String} origin The address of starting point  
@param {String} destination The address of destination  
@param {String} mode The mode of travel (driving, walking, bicycling or transit)  
@return {String} The time in minutes  
@customFunction \*/ const GOOGLEMAPS\_DURATION \= (origin, destination, mode \= "driving") \=\> { if (\!origin || \!destination) { throw new Error("No address specified\!"); } if (origin.map) { return origin.map(DISTANCE); } const key \= \["duration", origin, destination, mode\].join(","); const value \= getCache(key); if (value \!== null) return value; const { routes: \[data\] \= \[\] } \= Maps.newDirectionFinder() .setOrigin(origin) .setDestination(destination) .setMode(mode) .getDirections(); if (\!data) { throw new Error("No route found\!"); } const { legs: \[{ duration: { text: time } } \= {}\] \= \[\] } \= data; setCache(key, time); return time; };  
/\*\*  
Calculate the distance between two  
locations on Google Maps.  
\=GOOGLEMAPS\_DISTANCE("NY 10005", "Hoboken NJ", "walking")  
@param {String} origin The address of starting point  
@param {String} destination The address of destination  
@param {String} mode The mode of travel (driving, walking, bicycling or transit)  
@return {String} The distance in miles  
@customFunction \*/ const GOOGLEMAPS\_DISTANCE \= (origin, destination, mode \= "driving") \=\> { if (\!origin || \!destination) { throw new Error("No address specified\!"); } if (origin.map) { return origin.map(DISTANCE); } const key \= \["distance", origin, destination, mode\].join(","); const value \= getCache(key); if (value \!== null) return value;  
const { routes: \[data\] \= \[\] } \= Maps.newDirectionFinder() .setOrigin(origin) .setDestination(destination) .setMode(mode) .getDirections(); if (\!data) { throw new Error("No route found\!"); } const { legs: \[{ distance: { text: distance } } \= {}\] \= \[\] } \= data; setCache(key, distance);  
return distance; };  
/\*\*  
Get the latitude and longitude of any  
address on Google Maps.  
\=GOOGLEMAPS\_LATLONG("10 Hanover Square, NY")  
@param {String} address The address to lookup.  
@return {String} The latitude and longitude of the address.  
@customFunction \*/ const GOOGLEMAPS\_LATLONG \= (address) \=\> { if (\!address) { throw new Error("No address specified\!"); } if (address.map) { return address.map(LATLONG); } const key \= \["latlong", address\].join(","); const value \= getCache(key); if (value \!== null) return value;  
const { results: \[data \= null\] \= \[\] } \= Maps.newGeocoder().geocode(address); if (data \=== null) { throw new Error("Address not found\!"); } const { geometry: { location: { lat, lng } } \= {} } \= data; const answer \= ${lat}, ${lng}; setCache(key, answer); return answer; };  
/\*\*  
Get the full address of any zip code or  
partial address on Google Maps.  
\=GOOGLEMAPS\_ADDRESS("10005")  
@param {String} address The zip code or partial address to lookup.  
@return {String} The full address from Google Maps  
@customFunction \*/ const GOOGLEMAPS\_ADDRESS \= (address) \=\> { if (\!address) { throw new Error("No address specified\!"); } if (address.map) { return address.map(LATLONG); } const key \= \["address", address\].join(","); const value \= getCache(key); if (value \!== null) return value;  
const { results: \[data \= null\] \= \[\] } \= Maps.newGeocoder().geocode(address); if (data \=== null) { throw new Error("Address not found\!"); } const { formatted\_address } \= data; setCache(key, formatted\_address); return formatted\_address; };  
/\*\*  
Use Reverse Geocoding to get the address of  
a point location (latitude, longitude) on Google Maps.  
\=GOOGLEMAPS\_REVERSEGEOCODE(latitude, longitude)  
@param {String} latitude The latitude to lookup.  
@param {String} longitude The longitude to lookup.  
@return {String} The postal address of the point.  
@customFunction \*/  
const GOOGLEMAPS\_REVERSEGEOCODE \= (latitude, longitude) \=\> { if (\!latitude) { throw new Error("No latitude specified\!"); } if (\!longitude) { throw new Error("No longitude specified\!"); } const key \= \["reverse", latitude, longitude\].join(","); const value \= getCache(key); if (value \!== null) return value;  
const { results: \[data \= {}\] \= \[\] } \= Maps.newGeocoder().reverseGeocode( latitude, longitude ); const { formatted\_address } \= data; setCache(key, formatted\_address); return formatted\_address; };  
/\*\*  
Get the country name of an address on Google Maps.  
\=GOOGLEMAPS\_COUNTRY("10 Hanover Square, NY")  
@param {String} address The address to lookup.  
@return {String} The country of the address.  
@customFunction \*/ const GOOGLEMAPS\_COUNTRY \= (address) \=\> { if (\!address) { throw new Error("No address specified\!"); } if (address.map) { return address.map(COUNTRY); }  
const key \= \["country", address\].join(","); const value \= getCache(key); if (value \!== null) return value;  
const { results: \[data \= null\] \= \[\] } \= Maps.newGeocoder().geocode(address); if (data \=== null) { throw new Error("Address not found\!"); } const \[{ short\_name, long\_name } \= {}\] \= data.address\_components.filter( ({ types: \[level\] }) \=\> { return level \=== "country"; } ); if (\!short\_name) { throw new Error("Country not found\!"); } const answer \= ${long\_name} (${short\_name}); setCache(key, answer); return answer; };  
/\*\*  
Find the driving direction between two  
locations on Google Maps.  
\=GOOGLEMAPS\_DIRECTIONS("NY 10005", "Hoboken NJ", "walking")  
@param {String} origin The address of starting point  
@param {String} destination The address of destination  
@param {String} mode The mode of travel (driving, walking, bicycling or transit)  
@return {String} The driving direction  
@customFunction \*/ const GOOGLEMAPS\_DIRECTIONS \= (origin, destination, mode \= "driving") \=\> { if (\!origin || \!destination) { throw new Error("No address specified\!"); } const key \= \["directions", origin, destination, mode\].join(","); const value \= getCache(key); if (value \!== null) return value;  
const { routes \= \[\] } \= Maps.newDirectionFinder() .setOrigin(origin) .setDestination(destination) .setMode(mode) .getDirections(); if (\!routes.length) { throw new Error("No route found\!"); } const directions \= routes .map(({ legs }) \=\> { return legs.map(({ steps }) \=\> { return steps.map((step) \=\> { return step.html\_instructions .replace("\>\<", "\> \<") .replace(/\<\[^\>\]+\>/g, ""); }); }); }) .join(", "); setCache(key, directions); return directions; };

Table of Contents

* [1\.How to Install Google Maps Functions in Google Sheets](https://www.labnol.org/google-maps-sheets-200817#how-to-install-google-maps-functions-in-google-sheets)  
  * [1.1Using Google Maps inside Google Sheets](https://www.labnol.org/google-maps-sheets-200817#using-google-maps-inside-google-sheets)  
  * [1.21\. Calculate Distances in Google Sheets](https://www.labnol.org/google-maps-sheets-200817#1-calculate-distances-in-google-sheets)  
  * [1.32\. Reverse Geocoding in Google Sheets](https://www.labnol.org/google-maps-sheets-200817#2-reverse-geocoding-in-google-sheets)  
  * [1.43\. Get the GPS coordinates of an address](https://www.labnol.org/google-maps-sheets-200817#3-get-the-gps-coordinates-of-an-address)  
  * [1.54\. Print the driving directions between addresses](https://www.labnol.org/google-maps-sheets-200817#4-print-the-driving-directions-between-addresses)  
  * [1.65\. Measure the trip time with Google Maps](https://www.labnol.org/google-maps-sheets-200817#5-measure-the-trip-time-with-google-maps)  
  * [1.76\. Find the Elevation of any location](https://www.labnol.org/google-maps-sheets-200817#6-find-the-elevation-of-any-location)  
  * [1.8Tip: Improve Formula Performance by Caching](https://www.labnol.org/google-maps-sheets-200817#tip-improve-formula-performance-by-caching)

You can bring the power of Google Maps to your Google Sheets using simple formulas with no coding. You don’t need to sign up for the Google Maps API and all results from Google Maps are cached in the sheet so you are unlikely to hit any quota limits.

To give you a quick example, if you have the starting address in column A and the destination address in column B, a formula like \=GOOGLEMAPS\_DISTANCE(A1, B1, "driving") will quickly calculate the distance between the two points.

Or modify the formula slightly \=GOOGLEMAPS\_TIME(A1, B1, "walking") to know how long it will take for a person to walk from one point to another.

If you would like to try the Google Maps formulas without getting into the technical details, just make a copy of this [Google Sheet](https://docs.google.com/spreadsheets/d/1_WsL9KIhUYz5_6imBnjticTfa4g004YAfLrlK4Ix6w8/copy) and you are all set.

## How to Install Google Maps Functions in Google Sheets

To install the Google Maps functions in your Google Sheets, you need to add the functions to your Google Sheet.

1. Open your Google Sheet and click on “Extensions” in the top menu, then select “Apps Script.”  
2. In the Apps Script editor that opens, replace any existing code with the Google Maps functions below.

### Using Google Maps inside Google Sheets

This tutorial explains how you can easily write custom Google Maps functions inside Google Sheets that will help you:

1. Calculate distances between two cities or any addresses.  
2. Calculate the travel time (walking, driving or biking) between two points.  
3. Get the latitude and longitude co-ordinates of any address on Google Maps.  
4. Use reverse geocoding to find the postal address from GPS coordinates.  
5. Print driving directions between any points on earth.  
6. Get the address from the zip code itself.

#### 1\. Calculate Distances in Google Sheets

Specify the origin, the destination, the travel mode (walking or driving) and the function will return the distance between the two points in miles.

Maps

\=GOOGLEMAPS\_DISTANCE("NY 10005", "Hoboken NJ", "walking")

/\*\*

 \* Calculate the distance between two

 \* locations on Google Maps.

 \*

 \* \=GOOGLEMAPS\_DISTANCE("NY 10005", "Hoboken NJ", "walking")

 \*

 \* @param {String} origin The address of starting point

 \* @param {String} destination The address of destination

 \* @param {String} mode The mode of travel (driving, walking, bicycling or transit)

 \* @return {String} The distance in miles

 \* @customFunction

 \*/

const GOOGLEMAPS\_DISTANCE \= (origin, destination, mode \= "driving") \=\> {

  if (\!origin || \!destination) {

    return "Origin and destination are required\!";

  }

  const { routes: \[data\] \= \[\] } \= Maps.newDirectionFinder()

    .setOrigin(origin)

    .setDestination(destination)

    .setMode(mode)

    .getDirections();

  if (\!data) {

    return "No route found\!";

  }

  const { legs: \[{ distance: { text: distance } } \= {}\] \= \[\] } \= data;

  return distance;

};

#### 2\. Reverse Geocoding in Google Sheets

Specify the latitude and longitude and get the full address of the point through reverse geocoding of coordinates.

Web Apps & Online Tools

\=GOOGLEMAPS\_REVERSEGEOCODE(40.7128, \-74.0060)

/\*\*  
 \* Use Reverse Geocoding to get the address of  
 \* a point location (latitude, longitude) on Google Maps.  
 \*  
 \* \=GOOGLEMAPS\_REVERSEGEOCODE(latitude, longitude)  
 \*  
 \* @param {String} latitude The latitude to lookup.  
 \* @param {String} longitude The longitude to lookup.  
 \* @return {String} The postal address of the point.  
 \* @customFunction  
 \*/

const GOOGLEMAPS\_REVERSEGEOCODE \= (latitude, longitude) \=\> {  
  const { results: \[data \= {}\] \= \[\] } \= Maps.newGeocoder().reverseGeocode(latitude, longitude);  
  return data.formatted\_address;  
};

#### 3\. Get the GPS coordinates of an address

Get the latitude and longitude of any address on Google Maps.

\=GOOGLEMAPS\_LATLONG("10 Hanover Square, NY")

/\*\*  
 \* Get the latitude and longitude of any  
 \* address on Google Maps.  
 \*  
 \* \=GOOGLEMAPS\_LATLONG("10 Hanover Square, NY")  
 \*  
 \* @param {String} address The address to lookup.  
 \* @return {String} The latitude and longitude of the address.  
 \* @customFunction  
 \*/  
const GOOGLEMAPS\_LATLONG \= address \=\> {  
  const { results: \[data \= null\] \= \[\] } \= Maps.newGeocoder().geocode(address);  
  if (data \=== null) {  
    return "Address not found\!";  
  }  
  const { geometry: { location: { lat, lng } } \= {} } \= data;  
  return \`${lat}, ${lng}\`;  
};

4\. Print the driving directions between addresses  
Specify the origin address, the destination address, the travel mode and the function will use the Google Maps API to print step-by-step driving directions.

\=GOOGLEMAPS\_DIRECTIONS("NY 10005", "Hoboken NJ", "walking")

/\*\*  
 \* Find the driving direction between two  
 \* locations on Google Maps.  
 \*  
 \* \=GOOGLEMAPS\_DIRECTIONS("NY 10005", "Hoboken NJ", "walking")  
 \*  
 \* @param {String} origin The address of starting point  
 \* @param {String} destination The address of destination  
 \* @param {String} mode The mode of travel (driving, walking, bicycling or transit)  
 \* @return {String} The driving direction  
 \* @customFunction  
 \*/  
const GOOGLEMAPS\_DIRECTIONS \= (origin, destination, mode \= "driving") \=\> {  
  const { routes \= \[\] } \= Maps.newDirectionFinder()  
    .setOrigin(origin)  
    .setDestination(destination)  
    .setMode(mode)  
    .getDirections();  
  if (\!routes.length) {  
    throw new Error("No route found\!");  
  }  
  return routes  
    .map(({ legs }) \=\> {  
      return legs  
        .map(({ steps }) \=\> {  
          return steps  
            .map(step \=\> {  
              return step.html\_instructions.replace(/\<\[^\>\]+\>/g, "").replace(/\&quot;/g, '"');  
            })  
            .join(", ");  
        })  
        .join(", ");  
    })  
    .join(", ");  
};  
5\. Measure the trip time with Google Maps  
Specify the origin address, the destination address, the travel mode and the function will measure your approximate trip time between the specified addresses, provided a route exists.Maps

\=GOOGLEMAPS\_DURATION("NY 10005", "Hoboken NJ", "walking")

/\*\*  
 \* Calculate the travel time between two locations  
 \* on Google Maps.  
 \*  
 \* \=GOOGLEMAPS\_DURATION("NY 10005", "Hoboken NJ", "walking")  
 \*  
 \* @param {String} origin The address of starting point  
 \* @param {String} destination The address of destination  
 \* @param {String} mode The mode of travel (driving, walking, bicycling or transit)  
 \* @return {String} The time in minutes  
 \* @customFunction  
 \*/  
const GOOGLEMAPS\_DURATION \= (origin, destination, mode \= "driving") \=\> {  
  if (\!origin || \!destination) {  
    return "Origin and destination are required\!";  
  }  
  const { routes: \[data\] \= \[\] } \= Maps.newDirectionFinder()  
    .setOrigin(origin)  
    .setDestination(destination)  
    .setMode(mode)  
    .getDirections();  
  if (\!data) {  
    return "No route found\!";  
  }  
  const { legs: \[{ duration: { text: time } } \= {}\] \= \[\] } \= data;  
  return time;  
};

6\. Find the Elevation of any location  
Calculate the elevation of any location on Google Maps.

\=GOOGLEMAPS\_ELEVATION(37.423021, \-122.083739)

/\*\*  
 \* Calculate the elevation of any location  
 \* on Google Maps.  
 \*  
 \* \=GOOGLEMAPS\_ELEVATION(37.423021, \-122.083739)  
 \*  
 \* @param {String} latitude The latitude of the location  
 \* @param {String} longitude The longitude of the location  
 \* @return {String} The elevation in meters  
 \* @customFunction  
 \*/  
const GOOGLEMAPS\_ELEVATION \= (latitude, longitude) \=\> {  
  const { results: \[data\] \= \[\] } \= Maps.newElevationSampler().sampleLocation(latitude, longitude);  
  if (\!data) {  
    return "No elevation data found\!";  
  }  
  return data.elevation;  
};  
Tip: Improve Formula Performance by Caching  
The Google Sheets functions internally use the Google Maps API to calculate routes, distances and travel time. Google offers a limited quota for Maps operations and if your sheet performs too many queries in a short duration, you are likely to see errors like ""Service invoked too many times for one day” or something similar.Web Apps & Online Tools

To get around the quota issue, it is recommended that you use Apps Script’s built-in cache to store results and, if the results of a function already exist in the case, you’ll make one less request to Google Maps.

The Maps functions inside this Google Sheet also use caching and here’s how you can implement it.

// The cache key for "New York" and "new york  " should be same  
const md5 \= (key \= "") \=\> {  
  const code \= key.toLowerCase().replace(/\\s/g, "");  
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, code).reduce(  
    (str, byte) \=\> str \+ (byte \+ 256).toString(16).slice(-2),  
    ""  
  );  
};

const getCache \= key \=\> {  
  return CacheService.getDocumentCache().get(md5(key));  
};

// Store the results for 6 hours  
const setCache \= (key, value) \=\> {  
  const expirationInSeconds \= 6 \* 60 \* 60;  
  CacheService.getDocumentCache().put(md5(key), value, expirationInSeconds);  
};

/\*\*  
 \* Calculate the travel time between two locations  
 \* on Google Maps.  
 \*  
 \* \=GOOGLEMAPS\_DURATION("NY 10005", "Hoboken NJ", "walking")  
 \*  
 \* @param {String} origin The address of starting point  
 \* @param {String} destination The address of destination  
 \* @param {String} mode The mode of travel (driving, walking, bicycling or transit)  
 \* @return {String} The time in minutes  
 \* @customFunction  
 \*/  
const GOOGLEMAPS\_DURATION \= (origin, destination, mode \= "driving") \=\> {  
  if (\!origin || \!destination) {  
    return "Origin and destination are required\!";  
  }  
  const key \= \["duration", origin, destination, mode\].join(",");  
  const value \= getCache(key);  
  if (value \!== null) return value;  
  const { routes: \[data\] \= \[\] } \= Maps.newDirectionFinder()  
    .setOrigin(origin)  
    .setDestination(destination)  
    .setMode(mode)  
    .getDirections();  
  if (\!data) {  
    return "No route found\!";  
  }  
  const { legs: \[{ duration: { text: time } } \= {}\] \= \[\] } \= data;  
  setCache(key, time);  
  return time;  
};  
Also see: Embed Google Maps in Emails and DocumentsMaps
