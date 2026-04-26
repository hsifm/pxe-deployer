import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer, createTransform, PersistConfig, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { combineReducers } from '@reduxjs/toolkit';
import osProfilesReducer from './slices/osProfilesSlice';
import configurationsReducer from './slices/configurationsSlice';
import serversReducer from './slices/serversSlice';
import deploymentsReducer from './slices/deploymentsSlice';
import bootMenuReducer from './slices/bootMenuSlice';
import settingsReducer from './slices/settingsSlice';
import packageFilesReducer from './slices/packageFilesSlice';
import goldImagesReducer from './slices/goldImagesSlice';

const rootReducer = combineReducers({
  osProfiles: osProfilesReducer,
  configurations: configurationsReducer,
  servers: serversReducer,
  deployments: deploymentsReducer,
  bootMenu: bootMenuReducer,
  settings: settingsReducer,
  packageFiles: packageFilesReducer,
  goldImages: goldImagesReducer,
});

// Strip plaintext passwords before writing to localStorage.
// They are re-entered by the user each session in the ConfigurationEditor.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const configsTransform = createTransform<any, any>(
  // inbound: state → storage (scrub before writing)
  (state) => {
    if (!state || !Array.isArray(state.configs)) return state;
    return {
      ...state,
      configs: state.configs.map((c: Record<string, unknown>) => ({
        ...c,
        rootPassword: '',
        adminPassword: '',
      })),
    };
  },
  // outbound: storage → state (already scrubbed, pass through)
  (state) => state,
  { whitelist: ['configurations'] },
);

type RootState_ = ReturnType<typeof rootReducer>;

const persistConfig: PersistConfig<RootState_> = {
  key: 'pxe-deployer-v2',
  storage,
  transforms: [configsTransform],
  // Persist everything; IndexedDB blobs are handled separately
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
