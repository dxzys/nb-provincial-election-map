let electionResults = {};
let map;
let districtsLayer;

// Party colors for the map
const partyColors = {
    'PC': '#9999FF',
    'Liberal': '#EA6D6A', 
    'Green': '#99C955',
    'Unknown': '#cccccc'
};

function initializeMap() {
    map = L.map('map').setView([46.5653, -66.4619], 7);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18
    }).addTo(map);
    
    loadElectionResults();
}

async function loadElectionResults() {
    try {
        const response = await fetch('./election-results.json');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        electionResults = await response.json();
        console.log(`Election results loaded: ${Object.keys(electionResults).length} districts`);
        
        loadElectoralDistricts();
    } catch (error) {
        console.error('Error loading election results:', error);
        console.log('No election results available - districts will show without party coloring');
        
        electionResults = {};
        document.getElementById('district-count').textContent = 'No election data available';
        
        loadElectoralDistricts();
    }
}

function styleDistrict(feature) {
    const districtId = feature.properties.DIST_ID.toString().padStart(2, '0');
    const result = electionResults[districtId];
    
    if (result && result.party) {
        const color = partyColors[result.party] || partyColors['Unknown'];
        return {
            fillColor: color,
            weight: 2,
            opacity: 1,
            color: '#333',
            fillOpacity: 0.7
        };
    } else {
        return {
            fillColor: partyColors['Unknown'],
            weight: 2,
            opacity: 1,
            color: '#333',
            fillOpacity: 0.3
        };
    }
}

function onEachFeature(feature, layer) {
    if (feature.properties) {
        const districtId = feature.properties.DIST_ID.toString().padStart(2, '0');
        const result = electionResults[districtId];
        
        let popupContent = `
            <div class="district-popup">
                <div class="district-id">District ${feature.properties.DIST_ID}</div>
                <h4>${feature.properties.PED_Names_B || 'District Name Not Available'}</h4>
        `;
        
        if (result) {
            popupContent += `
                <p><strong>MLA:</strong> ${result.mla}</p>
                <p><strong>Party:</strong> ${result.party_full}</p>
                <p><strong>Votes:</strong> ${result.votes.toLocaleString()}</p>
                <p><strong>Percentage:</strong> ${result.percentage}%</p>
                <p><strong>Total District Votes:</strong> ${result.total_votes.toLocaleString()}</p>
            `;
            
            if (result.all_candidates && result.all_candidates.length > 0) {
                popupContent += `<p><strong>All Candidates:</strong></p><ul>`;
                result.all_candidates.forEach(candidate => {
                    popupContent += `<li>${candidate.name} (${candidate.party}) - ${candidate.votes.toLocaleString()} votes</li>`;
                });
                popupContent += `</ul>`;
            }
        } else {
            popupContent += `
                <p><strong>District ID:</strong> ${feature.properties.DIST_ID}</p>
                <p><strong>Label:</strong> ${feature.properties.LabelField || 'N/A'}</p>
                <p><strong>Area:</strong> ${(feature.properties.Shape_Area / 1000000).toFixed(2)} km²</p>
                <p><strong>Perimeter:</strong> ${(feature.properties.Shape_Length / 1000).toFixed(2)} km</p>
                <p><em>Election results not available</em></p>
            `;
        }
        
        popupContent += `</div>`;
        
        layer.bindPopup(popupContent);
        
        layer.on('mouseover', function() {
            this.setStyle({
                weight: 3,
                fillOpacity: 0.9
            });
        });
        
        layer.on('mouseout', function() {
            this.setStyle(styleDistrict(feature));
        });
    }
}

async function loadElectoralDistricts() {
    const geoNBEndpoint = 'https://geonb.snb.ca/arcgis/rest/services/GeoNB_ENB_Provincial_Elections/MapServer/2/query?where=1=1&outFields=*&f=geojson';
    
    try {
        const response = await fetch(geoNBEndpoint);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            districtsLayer = L.geoJSON(data, {
                style: styleDistrict,
                onEachFeature: onEachFeature
            }).addTo(map);
            
            map.fitBounds(districtsLayer.getBounds());
            document.getElementById('district-count').textContent = data.features.length;
            
            createPartyLegend();
            
            console.log(`Successfully loaded ${data.features.length} electoral districts from GeoNB API`);
        } else {
            throw new Error('No features found in the response');
        }
        
    } catch (error) {
        console.error('Error loading electoral districts from API:', error);
        document.getElementById('district-count').textContent = 'Error: Could not load district data';
        
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 15px rgba(0,0,0,0.1);
            text-align: center;
            z-index: 1000;
        `;
        errorDiv.innerHTML = `
            <h3>Unable to Load District Data</h3>
            <p>The application could not connect to the GeoNB API to load electoral district boundaries.</p>
            <p><strong>Error:</strong> ${error.message}</p>
            <p>Please check your internet connection and try refreshing the page.</p>
        `;
        document.body.appendChild(errorDiv);
    }
}

function createPartyLegend() {
    const legend = L.control({ position: 'bottomleft' });
    
    legend.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'legend');
        div.style.cssText = `
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 15px rgba(0,0,0,0.1);
            min-width: 200px;
        `;
        
        // count seats from election data
        const seatCounts = {};
        Object.values(electionResults).forEach(result => {
            if (result.party) {
                seatCounts[result.party] = (seatCounts[result.party] || 0) + 1;
            }
        });
        
        let legendHTML = '<h4>Party Legend</h4>';
        
        Object.keys(partyColors).forEach(party => {
            if (party !== 'Unknown' && seatCounts[party]) {
                const count = seatCounts[party];
                const label = party === 'PC' ? 'Progressive Conservative' : party;
                legendHTML += `
                    <div style="margin: 5px 0;">
                        <span style="display: inline-block; width: 20px; height: 20px; background-color: ${partyColors[party]}; margin-right: 8px; border: 1px solid #333;"></span>
                        <span>${label} (${count} seat${count > 1 ? 's' : ''})</span>
                    </div>
                `;
            }
        });
        
        legendHTML += '<hr style="margin: 10px 0;"><p><em>Click on any district to view election results</em></p>';
        
        div.innerHTML = legendHTML;
        return div;
    };
    
    legend.addTo(map);
}

document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
});
