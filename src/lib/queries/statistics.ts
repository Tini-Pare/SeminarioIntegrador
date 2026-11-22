import type { Equipo, Profile, Repuesto, Solicitud, WorkOrder } from "../../types/database";
import type { PlanInfo } from "../statistics";
import { listEquipment } from "./equipment";
import { listAllRequests, listWorkOrders } from "./faults";
import { listFaultTypes, normalizeGravedad, type Gravedad } from "./faultTypes";
import { listMaintenancePlans } from "./maintenancePlans";
import { listProfiles } from "./profiles";
import { listPurchaseOrders, type PurchaseOrderWithLines } from "./purchaseOrders";
import { listPurchases, type PurchaseWithDetail } from "./purchases";
import { listSpareParts } from "./spareParts";
import { listStockMovements, type StockMovement } from "./stockMovements";

// Everything the Estadísticas screen reads, loaded once: the period and
// type filters only re-run the pure calculations in lib/statistics.ts over
// it, so switching filters or tabs doesn't hit the database again. The
// supermarket's volume (hundreds of OTs, not millions) makes that cheaper
// than one RPC per chart, and needs no migration.
export type StatisticsData = {
  orders: WorkOrder[];
  requests: Solicitud[];
  equipment: Equipo[];
  profiles: Profile[];
  parts: Repuesto[];
  purchases: PurchaseWithDetail[];
  movements: StockMovement[];
  gravedadByFault: Map<string, Gravedad>;
  // Each plan's frequency is the deadline of its preventive OTs.
  plans: PlanInfo[];
  purchaseOrders: PurchaseOrderWithLines[];
};

export async function loadStatisticsData(): Promise<StatisticsData> {
  const [
    orders,
    requests,
    equipment,
    profiles,
    parts,
    purchases,
    movements,
    faultTypes,
    plans,
    purchaseOrders,
  ] = await Promise.all([
    listWorkOrders(),
    listAllRequests(),
    listEquipment(),
    listProfiles(),
    listSpareParts(),
    listPurchases(),
    listStockMovements(),
    listFaultTypes(),
    listMaintenancePlans(),
    listPurchaseOrders("all"),
  ]);
  return {
    orders,
    requests,
    equipment,
    profiles,
    parts,
    purchases,
    movements,
    gravedadByFault: new Map(
      faultTypes.map((f) => [f.fa_nombre, normalizeGravedad(f.fa_gravedad)]),
    ),
    plans,
    purchaseOrders,
  };
}
