import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Deployment } from '../../types';
import { initialDeployments } from '../../data/initialData';

interface DeploymentsState {
  deployments: Deployment[];
}

const initialState: DeploymentsState = {
  deployments: initialDeployments,
};

const deploymentsSlice = createSlice({
  name: 'deployments',
  initialState,
  reducers: {
    addDeployment: (state, action: PayloadAction<Deployment>) => {
      state.deployments.unshift(action.payload);
    },
    updateDeployment: (state, action: PayloadAction<Partial<Deployment> & { id: string }>) => {
      const dep = state.deployments.find(d => d.id === action.payload.id);
      if (dep) Object.assign(dep, action.payload);
    },
    appendLog: (state, action: PayloadAction<{ id: string; line: string }>) => {
      const dep = state.deployments.find(d => d.id === action.payload.id);
      if (dep) dep.logs.push(action.payload.line);
    },
  },
});

export const { addDeployment, updateDeployment, appendLog } = deploymentsSlice.actions;
export default deploymentsSlice.reducer;
