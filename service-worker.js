// Service Worker for Madrasa Attendance Management System
const CACHE_NAME = 'madrasa-attendance-v1.0';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Cache First Strategy
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(response => {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(() => {
          // If network fails and no cache, return offline page
          if (event.request.url.includes('.html')) {
            return caches.match('./index.html');
          }
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
  );
});

// Background Sync for Offline Data
self.addEventListener('sync', event => {
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncAttendanceData());
  }
});

// Sync offline attendance data
async function syncAttendanceData() {
  try {
    const db = await openDatabase();
    const offlineData = await getAllOfflineData(db);
    
    if (offlineData.length > 0) {
      console.log('Syncing offline data:', offlineData.length, 'records');
      
      // Here you would typically send data to your server
      // For now, we'll just log it and clear the offline storage
      
      // Clear offline data after successful sync
      await clearOfflineData(db);
      
      // Notify clients that sync is complete
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'SYNC_COMPLETE',
          data: offlineData
        });
      });
      
      console.log('Offline data synced successfully');
    }
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

// IndexedDB functions for offline storage
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MadrasaAttendanceDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create object store for offline attendance
      if (!db.objectStoreNames.contains('offlineAttendance')) {
        const store = db.createObjectStore('offlineAttendance', {
          keyPath: 'id',
          autoIncrement: true
        });
        
        // Create indexes
        store.createIndex('studentId', 'studentId', { unique: false });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

function getAllOfflineData(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['offlineAttendance'], 'readonly');
    const store = transaction.objectStore('offlineAttendance');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function clearOfflineData(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['offlineAttendance'], 'readwrite');
    const store = transaction.objectStore('offlineAttendance');
    const request = store.clear();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Push Notification Support
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'মাদ্রাসা হাজিরা সিস্টেম থেকে নোটিফিকেশন',
    icon: 'icons/icon-192x192.png',
    badge: 'icons/icon-96x96.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      {
        action: 'open',
        title: 'খুলুন'
      },
      {
        action: 'close',
        title: 'বন্ধ করুন'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('মাদ্রাসা হাজিরা', options)
  );
});

// Notification Click Event
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(windowClients => {
        for (let client of windowClients) {
          if (client.url === './' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('./');
        }
      })
    );
  }
});