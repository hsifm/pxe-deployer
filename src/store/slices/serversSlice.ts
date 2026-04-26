import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Server, DeploymentStatus } from '../../types';
import { initialServers } from '../../data/initialData';

interface ServersState {
  servers: Server[];
}

const initialState: ServersState = {
  servers: initialServers,
};

const serversSlice = createSlice({
  name: 'servers',
  initialState,
  reducers: {
    addServer: (state, action: PayloadAction<Server>) => {
      state.servers.push(action.payload);
    },
    updateServer: (state, action: PayloadAction<Server>) => {
      const idx = state.servers.findIndex(s => s.id === action.payload.id);
      if (idx !== -1) state.servers[idx] = action.payload;
    },
    deleteServer: (state, action: PayloadAction<string>) => {
      state.servers = state.servers.filter(s => s.id !== action.payload);
    },
    setServerStatus: (state, action: PayloadAction<{ id: string; status: DeploymentStatus }>) => {
      const server = state.servers.find(s => s.id === action.payload.id);
      if (server) server.status = action.payload.status;
    },
  },
});

export const { addServer, updateServer, deleteServer, setServerStatus } = serversSlice.actions;
export default serversSlice.reducer;
