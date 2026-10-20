# Cell 4 - Main worker loop (UPDATED: No duration limit)
import os
import subprocess
import time

import requests


def auth_headers(url):
    return dict(HDR) if url == H or url.startswith(H + '/') else {}


def absolute(url):
    if url.startswith('http://') or url.startswith('https://'):
        return url
    return f'{H}{url}'


def video_duration(path):
    result = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or 'ffprobe failed')
    return float(result.stdout.strip())


while True:
    job = None
    started = None
    try:
        r = requests.get(f'{H}/api/worker/next', headers=HDR, timeout=30)
        r.raise_for_status()
        job = r.json().get('job')
        if not job:
            time.sleep(POLL)
            continue

        state['busy'] = True
        state['jobId'] = job['jobId']
        started = time.time()
        print(f"[{job['jobId']}] start", flush=True)

        input_url = absolute(job['inputUrl'])
        with requests.get(input_url, headers=auth_headers(input_url), timeout=120, stream=True) as resp:
            resp.raise_for_status()
            with open(IN_PATH, 'wb') as f:
                for chunk in resp.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        f.write(chunk)

        duration = video_duration(IN_PATH)
        # NO DURATION LIMIT - Process any length video
        print(f"[{job['jobId']}] video duration: {duration:.1f}s - processing...", flush=True)

        os.makedirs(OUT_DIR, exist_ok=True)
        result = subprocess.run(
            [
                'python', 'inference_realesrgan_video.py',
                '-n', MODEL,
                '-i', IN_PATH,
                '-o', OUT_DIR,
                '-s', str(SCALE),
                '--suffix', 'out',
            ],
            cwd='/kaggle/working/Real-ESRGAN',
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            raise RuntimeError((result.stderr or result.stdout or 'inference failed').strip()[-300:])

        if not os.path.exists(OUT_PATH):
            raise FileNotFoundError(f'expected output not found: {OUT_PATH}')

        output_url = absolute(job['outputUrl'])
        headers = dict(auth_headers(output_url))
        headers['Content-Type'] = 'video/mp4'
        with open(OUT_PATH, 'rb') as f:
            payload = f.read()
        put = requests.put(output_url, data=payload, headers=headers, timeout=300)
        if put.status_code == 403:
            retry_headers = {k: v for k, v in headers.items() if k.lower() != 'content-type'}
            put = requests.put(output_url, data=payload, headers=retry_headers, timeout=300)
        put.raise_for_status()

        elapsed = time.time() - started
        done = requests.post(
            f"{H}/api/worker/{job['jobId']}/done",
            json={'processingSeconds': round(elapsed, 2)},
            headers=HDR,
            timeout=30,
        )
        done.raise_for_status()
        print(f"[{job['jobId']}] DONE in {elapsed:.1f}s", flush=True)
    except Exception as exc:
        elapsed = time.time() - started if started else 0
        if job and job.get('jobId'):
            try:
                requests.post(
                    f"{H}/api/worker/{job['jobId']}/failed",
                    json={'message': str(exc)[:300]},
                    headers=HDR,
                    timeout=30,
                )
            except Exception as report_exc:
                print(f"[{job.get('jobId')}] failed to report error: {report_exc}", flush=True)
        print(f'job failed after {elapsed:.1f}s: {exc}', flush=True)
    finally:
        state['busy'] = False
        state['jobId'] = None
        time.sleep(POLL)
