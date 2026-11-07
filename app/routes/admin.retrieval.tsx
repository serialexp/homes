import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation, useSubmit, Link } from "@remix-run/react";
import { useEffect, useState } from "react";
import { propertyTypes, areas } from "../data/propertyData.js";
import { enqueueRetrieval, getRetrievalProcessStatus, cancelRetrieval } from "../services/retrievalQueue.server.js";
import { storeRetrievalStatus } from "../services/redis.server.js";
import { requireAdminAuth } from "../utils/auth.server.js";
import {
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CODE_BLOCK,
  INPUT,
  LABEL,
  PageHeader,
  PANEL,
  StatusPill,
} from "../components/AdminUi.js";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminAuth(request);
  const status = await getRetrievalProcessStatus();
  return json({ status, propertyTypes, areas });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdminAuth(request);
  const formData = await request.formData();
  const action = formData.get("_action") as string;
  
  if (action === "reset") {
    await storeRetrievalStatus({
      status: 'idle',
      message: 'Status reset by admin',
      progress: 0,
      total: 0,
      startTime: new Date(),
      sectionsToFetch: 0,
      sectionsProcessed: 0
    });
    return json({ success: true, message: "Status reset to idle" });
  }

  if (action === "cancel") {
    try {
      const success = await cancelRetrieval();
      return json({ 
        success, 
        message: success 
          ? "Cancellation request sent. The process will stop after the current page completes." 
          : "No active retrieval process to cancel" 
      });
    } catch (error) {
      return json({ 
        success: false, 
        message: error instanceof Error ? error.message : "An error occurred while cancelling" 
      }, { status: 400 });
    }
  }
  
  // Handle start retrieval action
  const type = formData.get("type") as string;
  const region = formData.get("region") as string;
  const province = formData.get("province") as string;

  try {
    const options: Record<string, any> = {};
    
    if (type && type !== "all") {
      options.type = type;
    }
    
    if (region && region !== "all") {
      options.region = region;
    }
    
    if (province && province !== "all") {
      options.province = province;
    }
    
    await enqueueRetrieval(options);
    return json({ success: true, message: "Retrieval process started successfully" });
  } catch (error) {
    return json({ 
      success: false, 
      message: error instanceof Error ? error.message : "An error occurred" 
    }, { status: 400 });
  }
}

export default function RetrievalPage() {
  const { status, propertyTypes, areas } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const submit = useSubmit();
  
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  // Null only when no status has ever been stored; a status the server cannot read arrives as 'unknown'.
  const [currentStatus, setCurrentStatus] = useState(status);
  const isActive = currentStatus?.status === 'running' || currentStatus?.status === 'queued';
  
  // Follow progress as the worker publishes it, instead of polling
  useEffect(() => {
    const events = new EventSource("/admin/retrieval/events");
    events.onmessage = event => {
      const next = JSON.parse(event.data);
      setCurrentStatus(next ?? null);
    };
    return () => events.close();
  }, []);
  
  // Handle cancel button click
  const handleCancel = () => {
    const formData = new FormData();
    formData.append("_action", "cancel");
    submit(formData, { method: "post" });
  };

  // Handle reset button click
  const handleReset = () => {
    const formData = new FormData();
    formData.append("_action", "reset");
    submit(formData, { method: "post" });
  };
  
// Sections progress
const sectionsToFetch = currentStatus?.sectionsToFetch || 0;
const sectionsProcessed = currentStatus?.sectionsProcessed || 0;
const sectionsProgressPercentage = currentStatus && sectionsToFetch > 0
  ? Math.round((sectionsProcessed / sectionsToFetch) * 100)
  : 0;

  // Calculate progress percentage
  const progressPercentage = currentStatus && currentStatus.total > 0
    ? Math.round((currentStatus.progress / currentStatus.total) * 100)
    : 0;
  
  return (
    <>
      <PageHeader
        title="Retrieval"
        description="Scrapes Suumo in three phases. Runs automatically every day at 10:30 JST."
        actions={
          <Link to="/admin/retrieval/history" className={BUTTON_SECONDARY}>
            Job history
          </Link>
        }
      />

      {/* Status Display */}
      {currentStatus && (
        <section aria-labelledby="now-h" className={`${PANEL} overflow-hidden`}>
          <div className="flex flex-col gap-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 id="now-h" className="m-0 text-lg font-semibold">Current status</h2>
                  <StatusPill status={currentStatus.status} />
                </div>
                {currentStatus.startTime && (
                  <span className="text-sm text-base-content/70">
                    Started {new Date(currentStatus.startTime).toLocaleString()}
                  </span>
                )}
              </div>
              {currentStatus.status === 'running' && (
                <div className="flex flex-col items-end">
                  <span className="font-display text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums">
                    {progressPercentage}%
                  </span>
                  {currentStatus.estimatedCompletionTime && (
                    <span className="text-[13px] text-base-content/70">
                      Est. finish {new Date(currentStatus.estimatedCompletionTime).toLocaleString()}
                    </span>
                  )}
                </div>
              )}
            </div>

            {currentStatus.status === 'running' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">Sections</span>
                    <span className="tabular-nums text-base-content/70">{sectionsProcessed} / {sectionsToFetch}</span>
                  </div>
                  <div role="progressbar" aria-label="Sections" aria-valuenow={sectionsProgressPercentage} aria-valuemin={0} aria-valuemax={100} className="h-2.5 overflow-hidden rounded-full bg-base-300">
                    <div className="h-2.5 rounded-full bg-primary" style={{ width: `${sectionsProgressPercentage}%` }} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">Items</span>
                    <span className="tabular-nums text-base-content/70">{currentStatus.progress} / {currentStatus.total}</span>
                  </div>
                  <div role="progressbar" aria-label="Items" aria-valuenow={progressPercentage} aria-valuemin={0} aria-valuemax={100} className="h-2.5 overflow-hidden rounded-full bg-base-300">
                    <div className="h-2.5 rounded-full bg-[#5A78B4]" style={{ width: `${progressPercentage}%` }} />
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <span className={LABEL}>Message</span>
              <p className={`${CODE_BLOCK} text-[13px] leading-normal`}>{currentStatus.message}</p>
            </div>

            <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-x-5 gap-y-3.5 text-sm">
              {currentStatus.status === 'running' && currentStatus.estimatedCompletionTime && (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-base-content/60">Estimated completion</dt>
                  <dd className="m-0 font-semibold">{new Date(currentStatus.estimatedCompletionTime).toLocaleString()}</dd>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                <dt className="text-base-content/60">Sections processed</dt>
                <dd className="m-0 font-semibold tabular-nums">{sectionsProcessed} / {sectionsToFetch}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-base-content/60">Items processed</dt>
                <dd className="m-0 font-semibold tabular-nums">{currentStatus.progress} / {currentStatus.total}</dd>
              </div>
              {currentStatus.endTime && (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-base-content/60">Completed</dt>
                  <dd className="m-0 font-semibold">{new Date(currentStatus.endTime).toLocaleString()}</dd>
                </div>
              )}
            </dl>

            {currentStatus.error && (
              <p role="alert" className="m-0 rounded-field bg-error/10 px-3.5 py-2.5 text-sm font-medium text-error">
                Error: {currentStatus.error}
              </p>
            )}
          </div>

          {/* Cancel / Reset Buttons */}
          {currentStatus.status !== 'idle' && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 bg-base-200/60 px-6 py-4">
              <span className="text-sm text-base-content/70">
                Cancelling stops after the current page finishes. Force reset only clears a stuck status.
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className={BUTTON_SECONDARY}
                  disabled={isSubmitting}
                >
                  Force reset
                </button>
                {isActive && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className={BUTTON_DANGER}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Cancelling..." : "Cancel retrieval"}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}
      
      {/* Start New Retrieval Form */}
      <section aria-labelledby="new-h" className={`${PANEL} flex flex-col gap-5 p-6`}>
        <div className="flex flex-col gap-1">
          <h2 id="new-h" className="m-0 text-lg font-semibold">Start a manual retrieval</h2>
          <p className="m-0 text-base-content/70">Narrow the scope to re-run one region, prefecture or property type.</p>
        </div>

        {actionData && (
          <p
            role="status"
            className={`m-0 rounded-field px-3.5 py-2.5 text-sm font-medium ${
              actionData.success ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
            }`}
          >
            {actionData.message}
          </p>
        )}

        {isActive && (
          <p role="status" className="m-0 rounded-field bg-base-200 px-3.5 py-2.5 text-sm font-medium text-base-content/80">
            Cannot start a new retrieval while one is already queued or running
          </p>
        )}
        
        <Form method="post" className="flex flex-col gap-5">
          <input type="hidden" name="_action" value="start" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="type" className={LABEL}>Property Type</label>
              <select 
                id="type" 
                name="type" 
                className={INPUT}
                disabled={isSubmitting || isActive}
              >
                <option value="all">All Property Types</option>
                {Object.entries(propertyTypes).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label htmlFor="region" className={LABEL}>Region</label>
              <select 
                id="region" 
                name="region" 
                className={INPUT}
                disabled={isSubmitting || isActive}
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
              >
                <option value="all">All Regions</option>
                {Object.entries(areas).map(([id, area]) => (
                  <option key={id} value={id}>{area.name}</option>
                ))}
              </select>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label htmlFor="province" className={LABEL}>Prefecture</label>
              <select 
                id="province" 
                name="province" 
                className={INPUT}
                disabled={isSubmitting || isActive || selectedRegion === "all"}
              >
                <option value="all">All Prefectures</option>
                {selectedRegion !== "all" && Object.entries(areas[selectedRegion as keyof typeof areas]?.provinces || {}).map(([id, name]) => (
                  <option key={id} value={id}>{String(name)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <button
              type="submit"
              className={BUTTON_PRIMARY}
              disabled={isSubmitting || isActive}
            >
              {isSubmitting ? "Starting..." : "Start retrieval"}
            </button>
          </div>
        </Form>
      </section>
    </>
  );
}
